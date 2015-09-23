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

function EventLog(color) {
    if ( typeof EventLog.counter == 'undefined' ) {
        EventLog.counter = 0;
    }
    this.eid = EventLog.counter;
    EventLog.counter++;

    this.defSet = [];
    this.useSet = [];
    this.modSet = [];
    this.color = color;

    this.hasWrite = function (ref) {
        return this.writeSet.indexOf(ref) >= 0;
    };
}


// TODO: Please Set the env!
var instrumented_core_path = "/home/cwz/Eve/nodejs/instrumented/";
var debug = 1;
var util = require('util');

var colors = ['red', 'blue', 'green', 'purple', 'black'];

function getColor(id) {
    return colors[id % colors.length];
}

function DEBUG(str) {
    if (debug == 0)
         return;

    console.log('DEBUG: ' + str);
}

function CHECK(b) {
    if (!b) {
        DEBUG("assert failed!");
    }
}

function ignore(ref) {
    return ref === undefined || ref === null || typeof(ref) !== 'object';
}

function EventTable() {
    this.hashes = {};

    this.DEF_ACT = 0;
    this.USE_ACT = 0;
    this.MOD_ACT = 0;

    this.insert = function (ev) {
        this.hashes[ev.eid] = ev;
    };

    this.event = function (eid) {
        return this.hashes[eid];
    }

    this.pushAccess = function (eid, ref, act) {
        if (ignore(ref))
            return;

        // DEBUG('*');
        var set;
        if (act == this.DEF_ACT) {
            set = this.hashes[eid].defSet;
        }
        if (act == this.USE_ACT) {
            set = this.hashes[eid].useSet;
        }
        if (act == this.MOD_ACT) {
            set = this.hashes[eid].modSet;
        }

        if (set.indexOf(ref) >= 0)
            return;

        set.push(ref);
    };

    /* for now we focus on object dependence: we may try to wrap non-object in a object so we can treat them the same way
     * Consider following cases:
     *     0. a = {...}
              we are defining the value of reference a
     *     1. a = b
     *     2. a.x = b
     *     3. a.x = b.y
     *     4. a.x.y = b
     *     5. var a = b
     */
    this.numOfRAW = function (evA, evB) {
        CHECK(evA.eid > evB.eid); // make sure A is strictly after B

        var deps = 0;
        for (var i in evA.readSet) {
            var obj = evA.readSet[i];
            var last = true;

            for (var x = evB.eid + 1; x < evA.eid; x++) {
                if (this.event(x).hasWrite(obj))
                    last = false;
            }

            if (last && evB.hasWrite(obj)) {
                // DEBUG(util.inspect(obj));
                deps++;
            }
        }

        return deps;
    }

    this.generateDAG = function () {
        var dot = "digraph edg {\n";

        var i = 0, j = 0, ne = EventLog.counter;

        for (i = 0; i < ne; i++) {
            var cur = this.hashes[i];
            console.log(cur.readSet.length);
            dot = dot + i + " [ color=" + cur.color + " , style=filled, fontcolor=white ];\n";

            for (j = i + 1; j < ne; j++) {
                var ref = this.hashes[j];
                // DEBUG('ref> ' + ref.readSet.length);
                var num = etab.numOfRAW(ref, cur);

                if (num > 0) {
                    // there is RAW edge for (i, j)
                    var penwidth = num;
                    if (penwidth > 4.0) penwidth = 4.0;
                
                    var edge = "" + i + "->" + j +
                               " [ label=\"" + num + "\", penwidth=" + penwidth + " ];\n";
                    dot = dot + edge;
                }
            }
        }

        dot = dot + "}\n";

        var file = require("fs");
        console.log("Starting...\n" + dot); 
        file.writeFileSync("dependence.dot", dot);
        console.log("Done ..."); 
    };

}

var enableTracking = false;
var activeEvent;
var etab = new EventTable();

(function (sandbox) {

    function MyAnalysis() {
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid) {
            // console.log('call ' + f.name + ' ' + iid);

            if (f.name == 'pin_start') {
                console.log('===============');
                enableTracking = true;
                activeEvent = new EventLog( getColor(args[1]) );
                etab.insert(activeEvent);
                for (var arg in args[0]) {
                    etab.pushEventWrite(activeEvent.eid, args[0][arg]);
                }
            }
            if (f.name == 'pin_end') {
                enableTracking = false;
                etab.generateDAG();
            }
            return {f: f, base: base, args: args, skip: false};
        };
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid) {
            return {result: result};
        };
        this.forinObject = function (iid, val) {
            return {result: val};
        };
        this.declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {
            if (enableTracking) {
                etab.pushEventWrite(activeEvent.eid, val);
            }

            return {result: val};
        };
        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            return {base: base, offset: offset, skip: false};
        };
        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            if (enableTracking) {
                etab.pushEventRead(activeEvent.eid, base);
                etab.pushEventRead(activeEvent.eid, val);
            }

            return {result: val};
        };
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return {base: base, offset: offset, val: val, skip: false};
        };
        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            if (enableTracking) {
                etab.pushEventWrite(activeEvent.eid, base);
                etab.pushEventWrite(activeEvent.eid, val);
            }

            return {result: val};
        };
        this.read = function (iid, name, val, isGlobal, isScriptLocal) {
            if (enableTracking) {
                etab.pushEventRead(activeEvent.eid, val);
            }

            return {result: val};
        };
        this.write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
            if (enableTracking) {
                etab.pushEventWrite(activeEvent.eid, val);
            }

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



