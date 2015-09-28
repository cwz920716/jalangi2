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

var helper = require('./helper');

var noev = -1;
var enableTracking = false;
var activeEvent = noev;

function recvSet () {
    this.set = [];

    this.add = function (recv) {
        if (this.set.indexOf(recv) < 0) {
            this.set.push(recv);
        }
        return this.set.indexOf(recv);
    };

    this.getIndex = function (recv) {
        return this.set.indexOf(recv);
    };

    this.has = function (recv) {
        return this.set.indexOf(recv) >= 0;
    };
} 

// common case is only one owner will register one event
// so for now, goto easy case...
function ListenerTable() {
    this.cbMap = {}; // new ArrayMap();
    this.ownerMap = {}; // new ArrayMap();
    this.onceMap = {}; // new ArrayMap();
    this.rset = new recvSet();

    this.toListenerId = function (type, recv) {
        if (this.rset.has(recv)) {
            var idx = this.rset.getIndex(recv);
            return '__' + type + '_' + idx + '__';
        } else
            return null;
    };

    this.register = function (eid, type, recv, cb, once) {
        this.rset.add(recv);
        var id = this.toListenerId(type, recv);
        this.cbMap[id] = cb; // this.cbMap.add(id, cb);
        this.ownerMap[id] = eid; // this.ownerMap.add(id, eid);
        this.onceMap[id] = once; // this.onceMap.add(id, once);
    };

    this.unregister = function (type, recv) {
        var id = this.toListenerId(type, recv);
        this.cbMap[id] = null;
        this.ownerMap[id] = null;
        this.onceMap[id] = null;
    };

    this.isRegistered = function (type, recv) {
        var id = this.toListenerId(type, recv);
        if (id === null)
            return false;
        else
            return this.ownerMap.hasOwnProperty(id) && this.ownerMap[id] !== null;
    };

    this.isOnceRegistered = function (type, recv) {
        var id = this.toListenerId(type, recv);
        if (this.isRegistered(type, recv))
            return this.onceMap[id];
        else
            return false;
    };

    this.getRegisterEvents = function (type, recv) {
        var id = this.toListenerId(type, recv);
        if (this.isRegistered(type, recv)) {
            return this.ownerMap[id];
        } else
            return null;
    };

}

var listab = new ListenerTable();

(function (sandbox) {

    function MyAnalysis() {
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid) {

            var fname = f.name;
            if (fname === 'pin_addListener' || fname === 'pin_addOnceListener') {
                var type = args[0];
                var recv = args[1];
                var cb = args[2];
                var evid = -1;
                var once = false;
                if (activeEvent !== noev) {
                    evid = activeEvent.eid;
                }

                if (fname === 'pin_addOnceListener') {
                    once = true;
                }

                if (evid >= 0) {
                    listab.register(evid, type, recv, cb, once);
                }
                helper.DEBUG(fname + ':' + listab.toListenerId(type, recv));
                
            }
            
            if (f.name == 'pin_start') {
                var type = args[0];
                var recv = args[1];
                console.log('===================' + listab.toListenerId(type, recv) + '=======================================');

                enableTracking = true;
                activeEvent = new helper.EventLog( helper.getColor(args[1]) );
                helper.DEBUG('New Eve: ' + activeEvent.eid);

                if (listab.isRegistered(type, recv)) {
                    var register = listab.getRegisterEvents(type, recv);
                    helper.DEBUG(register + "------>" + activeEvent.eid);
                    if (listab.isOnceRegistered(type, recv)) {
                        listab.unregister(type, recv);
                    }
                }
            }

            if (f.name == 'pin_end') {
                enableTracking = false;
                activeEvent = noev;
            }

            return {f: f, base: base, args: args, skip: false};
        };
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid) {
            return {result: result};
        };
        this.literal = function (iid, val, hasGetterSetter) {
            return {result: val};
        };
        this.forinObject = function (iid, val) {
            return {result: val};
        };
        this.declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {
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
        this.functionEnter = function (iid, f, dis, args) {
        };
        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {
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



