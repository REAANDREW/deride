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
const events = require('events');
const utils = require('../utils');
_.mixin(utils.mixins);
const PREFIX = 'deride';


function Setup(obj, method, emitter) {
    //TODO refactor to remove this...
    /*jshint maxstatements:false*/
    //jshint maxcomplexity:8
    var debug = require('debug')(PREFIX + ':setup:' + method);
    var self = this;
    var Promises = require('when');
    var callQueue = [];
    var originalMethod = obj[method];
    var callToInvoke = normalCall;
    var callToInvokeOnArguments = {};
    var callQueueBasedOnArgs = {};
    var argumentsPredicate, lastPredicate, beforeFunc, key;
    var functionPredicates = [];
    var useCallQueue = false;

    self.toIntercept = function(func) {
        beforeFunc = function() {
            return func.apply(null, arguments);
        };
        return Object.freeze(self);
    };

    self.call = function call() {
        debug('call');
        if (_.isFunction(beforeFunc)) {
            debug('before call');
            beforeFunc.apply(self, arguments);
            debug('after before call');
        }
        var key = serializeArgs(arguments);
        var callFromQueueBasedOnArgs = callQueueBasedOnArgs[key];
        if (_.isArray(callFromQueueBasedOnArgs)) {
            var f = callFromQueueBasedOnArgs.pop();
            if (_.isFunction(f)) {
                debug('callFromQueueBasedOnArgs');
                return f.apply(self, arguments);
            }
            return callToInvoke.apply(self, arguments);
        }
        var callBasedOnArgs = callToInvokeOnArguments[key];
        if (_.isFunction(callBasedOnArgs)) {
            debug('callBasedOnArgs');
            return callBasedOnArgs.apply(self, arguments);
        }

        var args = arguments;
        var matchingPredicateTuple = functionPredicates.find(function(tuple) {
            return tuple[0].apply(self, args);
        });
        if (matchingPredicateTuple) {
            debug('callBasedOnPredicate');
            return matchingPredicateTuple[1].apply(self, arguments);
        }
        if (!_.isEmpty(callQueue)) {
            var func = callQueue.pop();
            debug('callQueue', callQueue.length);
            if (_.isEmpty(callQueue)) {
                callQueue.unshift(func);
            }
            return func.apply(self, arguments);
        }
        return callToInvoke.apply(self, arguments);
    };

    self.times = function(count) {
        debug('times', count, callQueue);
        useCallQueue = true;
        var queue = callQueue;
        if (key) {
            queue = callQueueBasedOnArgs[key];
        }
        if (_.isEmpty(queue)) {
            queue.push(callToInvoke);
        }
        var last = queue.pop();
        if (last) {
            _.times(count, function() {
                queue.unshift(last);
            });
        }
        return Object.freeze(self);
    };

    self.once = function() {
        return self.times(1);
    };
    self.twice = function() {
        return self.times(2);
    };

    _.forEach(['and', 'then', 'but'], function(alias) {
        self[alias] = self;
    });

    function getArgArray(argArray) {
        if (argArray.length === 1 && _.isArray(argArray[0])) {
            return argArray[0];
        }
        return argArray;
    }

    self.fallback = function fallback() {
        return self.toDoThis(originalMethod);
    };

    self.toCallbackWith = function toCallbackWith() {
        var args = getArgArray([].slice.call(arguments));
        var func = function() {
            debug('toCallbackWith', args);
            var index = _.findLastIndex(arguments, _.isFunction);
            arguments[index].apply(null, args);
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.toDoThis = function toDoThis(func) {
        var wrapper = function() {
            debug('toDoThis override', arguments);
            var result = func.apply(obj, arguments);
            return result;
        };
        checkArgumentsToInvoke(wrapper);
        return Object.freeze(self);
    };

    self.toEmit = function toEmit() {
        var args = Array.prototype.slice.call(arguments);
        var func = function() {
            debug('toEmit', arguments);
            emitter.emit.apply(emitter, args);
            return originalMethod.apply(obj, arguments);
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.toRejectWith = function toRejectWith(arg) {
        var func = function() {
            debug('toRejectWith', arg, arguments);
            return Promises.reject(arg);
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.toResolveWith = function toResolveWith(arg) {
        var func = function() {
            debug('toResolveWith', arg, arguments);
            return Promises.resolve(arg);
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.toReject = self.toRejectWith;
    self.toResolve = self.toResolveWith;

    self.toReturn = function toReturn(value) {
        var overrideReturnValue = function() {
            debug('toReturn', value, arguments);
            return value;
        };
        checkArgumentsToInvoke(overrideReturnValue);
        return Object.freeze(self);
    };

    self.toThrow = function toThrow(message) {
        var func = function() {
            debug('toThrow', message, arguments);
            throw new Error(message);
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.toTimeWarp = function toTimeWarp(milliseconds) {
        var func = function() {
            debug('toTimeWarp', milliseconds, arguments);
            var originalTimeoutFunc = setTimeout;
            setTimeout = function(delegate, timeout) {
                originalTimeoutFunc(delegate, timeout - milliseconds);
            };
            var result = originalMethod.apply(obj, arguments);
            return result;
        };
        checkArgumentsToInvoke(func);
        return Object.freeze(self);
    };

    self.when = function when() {
        debug('when');
        if (_.isFunction(arguments['0'])) {
            debug('function predicate');
            lastPredicate = arguments['0'];
        } else {
            argumentsPredicate = arguments;
        }
        return Object.freeze(self);
    };

    function checkArgumentsToInvoke(func) {
        debug('checkArgumentsToInvoke');
        if (argumentsPredicate !== null && argumentsPredicate !== undefined) {
            key = serializeArgs(argumentsPredicate);
            debug('argumentsPredicate', key);
            callToInvokeOnArguments[key] = func;
            callQueueBasedOnArgs[key] = _.union([func], callQueueBasedOnArgs[key]);
            debug('callQueueBasedOnArgs', callQueueBasedOnArgs);
            argumentsPredicate = null;
            return;
        }
        if (_.isFunction(lastPredicate)) {
            functionPredicates.push([lastPredicate, func]);
            return;
        }
        debug('no predicate function', { callQueue });
        callToInvoke = func;
        if (useCallQueue) {
            debug('using the callQueue');
            callQueue.unshift(func);
        }
    }

    function normalCall() {
        debug('normal call', method);
        var result = originalMethod.apply(obj, arguments);
        return result;
    }

    function serializeArgs(args) {
        return JSON.stringify(args);
    }

    return (function() {
        return Object.freeze(self);
    }());
}

module.exports = { Setup };