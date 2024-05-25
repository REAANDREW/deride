/*
  Copyright (c) 2014 Andrew Rea
  Copyright (c) 2014 James Allen

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation
  files (the "Software"), to deal in the Software without
  restriction, including without limitation the rights to use,
  copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the
  Software is furnished to do so, subject to the following
  conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
  OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
  WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
  OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict';

const _ = require('lodash');
const assert = require('assert');
const utils = require('../utils');
_.mixin(utils.mixins);
const PREFIX = 'deride';

//jshint maxstatements:31
function Expectations(obj, method) {
    const debug = require('debug')(PREFIX + ':expectations:' + method);
    let timesCalled = 0;
    const calledWithArgs = {};

    function call() {
        calledWithArgs[timesCalled++] = _.cloneDeep(arguments);
    }

    function invocation(index) {
        if (!(index.toString() in calledWithArgs)) {
            throw new Error('invocation out of range');
        }
        const arg = calledWithArgs[index.toString()];
        return { withArg: withArg(arg) };
    }

    const self = {
        invocation: invocation,
        call: call
    };

    function checkArg(expected, values) {
        if (_.isArray(expected)) {
            const jsonExpected = JSON.stringify(expected);
            return _.some(_.filter(values, function(v) {
                return JSON.stringify(v) === jsonExpected;
            }));
        }
        if (_.isObject(expected)) {
            return _.some(_.filter(values, expected));
        }
        return _.includes(values, expected);
    }

    function checkArgs(expectedArgs, callArgs, evaluator) {
        const values = _.values(callArgs);
        const argResults = [];
        for (let argIndex = 0; argIndex < expectedArgs.length; argIndex++) {
            const expected = expectedArgs[argIndex];
            debug('expected', expected, 'in', values);
            const foundArg = checkArg(expected, values);
            argResults.push(foundArg);
        }
        return evaluator(argResults);
    }

    function checkAnyArgs(expectedArgs, callArgs) {
        return checkArgs(expectedArgs, callArgs, _.some);
    }

    function withArgs() {
        const args = _.values(arguments);
        assertArgsWithEvaluator(calledWithArgs, args, _.every);
    }

    function withSingleArg(arg) {
        const args = [arg];
        assertArgsWithEvaluator(calledWithArgs, args, _.some);
    }

    function withMatch(pattern) {
        debug(calledWithArgs);
        const matched = false;
        _.forEach(calledWithArgs, function(args) {
            if (matched) {
                return;
            }
            _.forEach(_.values(args), function(arg) {
                if (matched) {
                    return;
                }
                if (_.isObject(arg)) {
                    matched = objectPatternMatchProperties(arg, pattern);
                    debug('is object match?', matched, arg, pattern);
                    return;
                }
                matched = pattern.test(arg);
                debug('is match?', matched, arg, pattern);
            });
        });
        if (!matched) {
            assert.fail(calledWithArgs, pattern, 'Expected ' + method + ' to be called matching: ' + pattern);
        }
    }

    function matchExactly() {
        const expectedArgs = _.values(arguments);
        const matched = true;
        _.forEach(calledWithArgs, function(args) {
            _.forEach(_.values(args), function(arg, i) {
                if (!_.isEqual(arg, expectedArgs[i])) {
                    matched = false;
                    debug('is object match?', matched, arg, expectedArgs[i]);
                    return;
                }
                debug('is match?', matched, arg, expectedArgs[i]);
            });
        });
        if (!matched) {
            assert.fail(calledWithArgs, expectedArgs, 'Expected ' + method + ' to be called matchExactly args' + require('util').inspect(expectedArgs, {
                depth: 10
            }));
        }
    }

    function objectPatternMatchProperties(obj, pattern) {
        const matched = false;
        _.deepMapValues(obj, function(i) {
            if (!matched) {
                matched = pattern.test(i);
            }
            debug(i, matched);
        });
        return matched;
    }

    function assertArgsWithEvaluator(argsToCheck, args, evaluator) {
        const callResults = [];
        _.forEach(argsToCheck, function(value) {
            debug('checking', value, args);
            const argResult = checkArgs(args, value, evaluator);
            callResults.push(argResult);
        });
        const result = _.some(callResults);
        assert(result, 'Expected ' + method + ' to be called with: ' + args.join(', '));
    }

    function withArg(args) {
        return function(arg) {
            assert(checkAnyArgs([arg], args));
        };
    }

    function times(number, err) {
        if (!err) {
            err = 'Expected ' + method + ' to be called ' + utils.humanise(number) + ' but was ' + timesCalled;
        }
        assert.equal(timesCalled, number, err);
    }

    function calledLteGte(number, predicate, friendly, err) {
        if (!err) {
            err = 'Expected ' + method + ' to be called ' + friendly + ' ' + utils.humanise(number) + ' but was ' + timesCalled;
        }
        assert.ok(predicate(timesCalled, number), err);
    }

    function calledLt(number, err) {
        calledLteGte(number, _.lt, 'less than', err);
    }

    function calledLte(number, err) {
        calledLteGte(number, _.lte, 'less than or equal to', err);
    }

    function calledGt(number, err) {
        calledLteGte(number, _.gt, 'greater than', err);
    }

    function calledGte(number, err) {
        calledLteGte(number, _.gte, 'greater than or equal to', err);
    }

    function never(err) {
        times(0, err);
    }

    function calledOnce(err) {
        times(1, err);
    }

    function calledTwice(err) {
        times(2, err);
    }

    function reset() {
        timesCalled = 0;
        calledWithArgs = {};
    }

    function addNotMethods(obj) {
        function negate(func) {
            return function() {
                const args = _.values(arguments);
                try {
                    func.call(null, args);
                } catch (err) {
                    return self;
                }
                assert(false);
            };
        }

        let methods = {};
        const calledMethods = _.omit(utils.methods(obj.called), 'reset');
        _.forEach(calledMethods, function(method) {
            methods[method] = negate(obj.called[method]);
        });
        obj.called.not = methods;
        return obj;
    }

    self.called = {
        times: times,
        never: never,
        once: calledOnce,
        twice: calledTwice,
        lt: calledLt,
        lte: calledLte,
        gt: calledGt,
        gte: calledGte,
        reset: reset,
        matchExactly: matchExactly,
        withArgs: withArgs,
        withArg: withSingleArg,
        withMatch: withMatch
    };

    return (function() {
        return Object.freeze(addNotMethods(self));
    }());
}

module.exports = { Expectations }