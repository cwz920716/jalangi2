/*
 * Copyright 2014 Samsung Information Systems America, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: Koushik Sen

// do not remove the following comment
// JALANGI DO NOT INSTRUMENT

/**
 * @file A template for writing a Jalangi 2 analysis
 * @author  Koushik Sen
 *
 */

helper = require('./helper');
util = require('util');

/* First, we only consider access variable namespace in a single module
 * so we don't consider require because it is kind of special
 * The goal will be track how closure & variable namespace are defined
 * and given specific function closure and var name, we can get what this var is refering to
 * Notice: 1) a run of a function is creating a new scope
           2) a declaration of a function is creating a new closure with a pointer to the enclosing scope
           3) a run of closure will also creating a scope
 * Q: What is a scope?
 * A: a scope is a run of a function. Usually a scope should always have a parent scope. A global scope is a special scope.
 * Q: So what is closure?
 * A: A closure is a function defined in another function. So closure MUST have a parent scope.
 * Q: Is function also a closure?
 * A: No! A non-closure function can only have access to a global scope.
 * Q: Is Constructor a scope or closure?
 * Q: Is Method a implied closure?
 * A: Yeap!
 */

function __GLOBAL_FP__() {}

function Scope(f, parent) {
    this.fp = f; // remember the function pointer
    this.parent = parent;

    this.isGlobal = function() {
        return this.fp === __GLOBAL_FP__ && parent === null;
    }

    this.namespace = {} // create a empty name space

    this.Name = helper.printName(f); // N is in uppercase to avoid unnecessary trouble

    this.print = function() {
        var msg = '{' + this.Name + '}';
        var parent = this.parent;
        while (parent !== null) {
            msg = msg + ' => {' + parent.Name + '}';
            parent = parent.parent;
        }
 
        return msg;
    }

    this.lookup = function (name) {
        var hasIt = false, createIt = this.isGlobal(); // if this is a global scope, we allow lookup() to add names
                                                       // otherwise it can only add name into namespace through declare

        if (util.isString(name)) {
            hasIt = this.namespace.hasOwnProperty(name);
            if ( !hasIt && createIt ) {
                this.namespace[name] = new helper.AccessLog();
                hasIt = true;
            }
            if (hasIt)
                return this.namespace[name];
            else
                return null;
        }
        
        helper.ERROR('lookup can only do string searching!');
    }

    this.declare = function(name) {
        var hasIt = false, createIt = true; 

        if (name == 'hasOwnProperty')
            return;
    
        if (util.isString(name)) {
            hasIt = this.namespace.hasOwnProperty(name);
            if ( !hasIt && createIt ) {
                this.namespace[name] = new helper.AccessLog();
                hasIt = true;
            }

            return;
        }
        
        helper.ERROR('declare can only do string insertion!');
    }
}

var __GLOBAL_SCOPE__ = new Scope(__GLOBAL_FP__, null);

function Closure(fp, parentScope, etc) {
    this.fp = fp; // For a scope a fp is not just a name/function pointer, it can be used to compare if two closure are the same, like a id.
    helper.CHECK(parentScope !== null); 
    this.parentScope = parentScope;
    this.etc = etc;
}

function ClosureSet() {
    this.set = []; // it is called a set, but internally a simple array
    this.index = []; // a index which stores the 'id' of a closure

    this.add = function (clos) {
        var fp = clos.fp;
        var hasIt = (this.index.indexOf(fp) >= 0);

        if (!hasIt) {
            this.set.push(clos);
            this.index.push(fp);
        }
    };

    this.newClosure = function (fp, scope, etc) {
        var clos = new Closure(fp, scope, etc);

        // We actually should push it into a closure map
        this.add(clos);
        return clos;
    };

    this.isClosure = function (fp) {
        var hasIt = (this.index.indexOf(fp) >= 0);
        return hasIt;
    };

    this.getClosure = function (fp) {
        var idx = this.index.indexOf(fp);
        return this.set[idx];
    };
}

var closet = new ClosureSet();

function newScope(f) {
    var parent = __GLOBAL_SCOPE__, clos;
    if (closet.isClosure(f)) {
        clos = closet.getClosure(f);
        parent = clos.parentScope;
    } 

    var scp = new Scope(f, parent);
    return scp;
}

var currentScope = __GLOBAL_SCOPE__;
var scopeStack = [];

(function (sandbox) {
    function MyAnalysis() {
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid) {
            return {f: f, base: base, args: args, skip: false};
        };

        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid) {
            return {result: result};
        };

        /**
         * This callback is called after the creation of a literal.  A literal can be a function literal, an object literal,
         * an array literal, a number, a string, a boolean, a regular expression, null, NaN, Infinity, or undefined.
         *
         * @example
         * x = "Hello"
         *
         * // the above call roughly gets instrumented as follows:
         *
         * var result = "Hello";
         * var aret = analysis.literal(201, result, false);
         * if (aret) {
         *     result = aret.result;
         * }
         * x = result;
         *
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {*} val - The literal value
         * @param {boolean} hasGetterSetter - True if the literal is an object and the object defines getters and setters
         * @returns {{result: *} | undefined} - If the function returns an object, then the original literal value is
         * replaced with the value stored in the <tt>result</tt> property of the object.
         *
         */
        this.literal = function (iid, val, hasGetterSetter) {
            if (util.isFunction(val)) {
                 // helper.DEBUG('literal Funct>');

                 if (!currentScope.isGlobal()) {
                     // I am not in global, hence a new closure
                     var etc = {};
                     etc["iid"] = iid;
                     var clos = closet.newClosure(val, currentScope, etc);
                 }

            }
            return {result: val};
        };

        /**
         * This callback is called when a for-in loop is used to iterate the properties of an object.
         *
         *@example
         * for (x in y) { }
         *
         * // the above call roughly gets instrumented as follows:
         *
         * var aret = analysis.forinObject(iid, y);
         * if (aret) {
         *     y = aret.result;
         * }
         * for (x in y) {}
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {*} val - Objects whose properties are iterated in a for-in loop.
         * @returns {{result: *} | undefined} - If the function returns an object, then the original object whose
         * properties are being iterated is replaced with the value stored in the <tt>result</tt> property of the
         * returned object.
         *
         */
        this.forinObject = function (iid, val) {
            return {result: val};
        };

        /**
         * This callback is triggered at the beginning of a scope for every local variable declared in the scope, for
         * every formal parameter, for every function defined using a function statement, for <tt>arguments</tt>
         * variable, and for the formal parameter passed in a catch statement.
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {string} name - Name of the variable that is declared
         * @param {*} val - Initial value of the variable that is declared.  Variables can be local variables, function
         * parameters, catch parameters, <tt>arguments</tt>, or functions defined using function statements.  Variables
         * declared with <tt>var</tt> have <tt>undefined</tt> as initial values and cannot be changed by returning a
         * different value from this callback.  On the beginning of an execution of a function, a <tt>declare</tt>
         * callback is called on the <tt>arguments</tt> variable.
         * @param {boolean} isArgument - True if the variable is <tt>arguments</tt> or a formal parameter.
         * @param {number} argumentIndex - Index of the argument in the function call.  Indices start from 0.  If the
         * variable is not a formal parameter, then <tt>argumentIndex</tt> is -1.
         * @param {boolean} isCatchParam - True if the variable is a parameter of a catch statement.
         * @returns {{result: *} | undefined} - If the function returns an object, then the original initial value is
         * replaced with the value stored in the <tt>result</tt> property of the object.  This does not apply to local
         * variables declared with <tt>var</tt>.
         *
         */
        this.declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {

            helper.DEBUG('declare>' + name);
            if (util.isFunction(val)) {     

                 if (!currentScope.isGlobal()) {
                     // I am not in global, hence a new closure
                     var etc = {};
                     etc["iid"] = iid;
                     etc["name"] = name;
                     var clos = closet.newClosure(val, currentScope, etc);
                 }
            }
            // if (!currentScope.isGlobal()) 
                currentScope.declare(name);

            return {result: val};
        };

        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            return {base: base, offset: offset, skip: false};
        };

        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            return {result: val};
        };

        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return {base: base, offset: offset, val: val, skip: false};
        };

        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            return {result: val};
        };

        this.read = function (iid, name, val, isGlobal, isScriptLocal) {
            return {result: val};
        };

        this.write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
            return {result: val};
        };

        this._return = function (iid, val) {
            return {result: val};
        };

        this._throw = function (iid, val) {
            return {result: val};
        };

        this._with = function (iid, val) {
            return {result: val};
        };

        /**
         * This callback is called before the execution of a function body starts.
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {function} f - The function object whose body is about to get executed
         * @param {*} dis - The value of the <tt>this</tt> variable in the function body
         * @param {Array} args - List of the arguments with which the function is called
         * @returns {undefined} - Any return value is ignored
         */
        this.functionEnter = function (iid, f, dis, args) {
            // I am entering a instrumented function so a new scope should be created
            // if (f.name == 'require') { console.log('haha'); return; } // skip require

            var scope = newScope(f);
            console.log(sandbox.iidToLocation(sandbox.sid, iid));
            helper.DEBUG("FE Leave << " + currentScope.print());
            scopeStack.push(currentScope);
            currentScope = scope;
            helper.DEBUG("FE Enter << " + currentScope.print());
        };

        /**
         * This callback is called when the execution of a function body completes
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {*} returnVal - The value returned by the function
         * @param {{exception:*} | undefined} wrappedExceptionVal - If this parameter is an object, the function
         * execution has thrown an uncaught exception and the exception is being stored in the <tt>exception</tt>
         * property of the parameter
         * @returns {{returnVal: *, wrappedExceptionVal: *, isBacktrack: boolean}}  If an object is returned, then the
         * actual <tt>returnVal</tt> and <tt>wrappedExceptionVal.exception</tt> are replaced with that from the
         * returned object. If an object is returned and the property <tt>isBacktrack</tt> is set, then the control-flow
         * returns to the beginning of the function body instead of returning to the caller.  The property
         * <tt>isBacktrack</tt> can be set to <tt>true</tt> to repeatedly execute the function body as in MultiSE
         * symbolic execution.
         */
        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {
            // if (currentScope == __GLOBAL_SCOPE__) { return } // skip require

            helper.DEBUG("FX Leave << " + currentScope.print());
            currentScope = scopeStack.pop();
            helper.DEBUG("FX Enter << " + currentScope.print());
            return {returnVal: returnVal, wrappedExceptionVal: wrappedExceptionVal, isBacktrack: false};
        };

        this.scriptEnter = function (iid, instrumentedFileName, originalFileName) {
        };

        this.scriptExit = function (iid, wrappedExceptionVal) {
            return {wrappedExceptionVal: wrappedExceptionVal, isBacktrack: false};
        };

        this.binaryPre = function (iid, op, left, right, isOpAssign, isSwitchCaseComparison, isComputed) {
            return {op: op, left: left, right: right, skip: false};
        };

        this.binary = function (iid, op, left, right, result, isOpAssign, isSwitchCaseComparison, isComputed) {
            return {result: result};
        };

        this.unaryPre = function (iid, op, left) {
            return {op: op, left: left, skip: false};
        };

        this.unary = function (iid, op, left, result) {
            return {result: result};
        };

        this.conditional = function (iid, result) {
            return {result: result};
        };

        this.instrumentCodePre = function (iid, code) {
            return {code: code, skip: false};
        };

        this.instrumentCode = function (iid, newCode, newAst) {
            return {result: newCode};
        };

        this.endExpression = function (iid) {
        };

        this.endExecution = function () {
        };

        this.runInstrumentedFunctionBody = function (iid, f, functionIid) {
            return false;
        };

        this.onReady = function (cb) {
            cb();
        };
    }

    sandbox.analysis = new MyAnalysis();
})(J$);



