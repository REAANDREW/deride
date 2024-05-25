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
const utils = require('../utils');
_.mixin(utils.mixins);
const PREFIX = 'deride';
const wrap = require('./wrap');

function stub(target, properties, options) {
    options = _.defaults(options, { debug: { prefix: PREFIX, suffix: 'stub' }});
    const debug = require('debug')(`${options.debug.prefix}:${options.debug.suffix}`);
    debug(target);
    let methods = [];
    if (_.isArray(target)) {
        methods = target;
    } else {
        methods = utils.methods(target);
    }

    let stubObj = {};
    const emptyMethod = function() {
        return function() {};
    };
    for (let i = 0; i < methods.length; i++) {
        stubObj[methods[i]] = emptyMethod();
    }
    _.forEach(properties, function(prop) {
        Object.defineProperty(stubObj, prop.name, prop.options);
    });
    return wrap(stubObj, options);
}

module.exports = { stub };