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

var util = require('util');
var helper = require('./helper');

// TODO: Please Set the env!
var instrumented_core_path = "/home/cwz/Eve/nodejs/instrumented/";


    /* the set will record two things:
     * the literal name of variables we are accessed
     * the reference of the object we accessed
     * Consider a case like X = Y
     * We have 2 possibilities:
                 1. X is a variable, maybe some other event callback can also r/w X
                    However, if they can see X, the only way to modify it is through the exactly same name X
                 2. X is a of form X.x, where X coule be of another form (XX.x)
                    if we focus on last level of the form, we are modifying some property of some object, maybe some other event callback can also r/w X.x
                    But they must hold the reference to X
       So we restrict our r/w set to these two classes:
            1. we r/w a variable, it could be global/local/closure
               we track the 'name' of the variable because that's the only way to access it
            2. we r/w a property of a object
               we track the reference of that object
     */

function EventLog(color) {
    if ( typeof EventLog.counter == 'undefined' ) {
        EventLog.counter = 0;
    }
    this.eid = EventLog.counter;
    EventLog.counter++;

    this.dependences = {}; // by dependences, it could only be a RAW dependence
    this.color = color;

    this.addDependence = function (eid) {
        if ( !helper.hasKey(this.dependences, eid) ) {
            this.dependences[eid] = 0;
        }
        this.dependences[eid]++;
    };
}

function AccessLog() {
    this.reader = -1;
    this.writer = -1;

    this.read = function(r) {
        this.reader = r;
    };

    this.write = function(w) {
        this.writer = w;
    };

    this.writeBefore = function() {
        return this.writer != -1;
    }

    this.hasRAW = function(eid) {
        return this.writeBefore() && this.writer < eid;
    }
}

function ignore(ref) {
    return ref === undefined || ref === null;
}

function EventTable() {
    this.hashes = {}; // all event logs, key is eid and value is the EventLog object
    this.namespace = {} // the name space for all variables, the key will be a var name while value is a descriptor object
    this.objectspace = [] // the array where we put a object
    this.shadowspace = [] // the array for annotator of all objects
                          // theobjectspace and shadowspace always have the same size

    this.insert = function (ev) {
        this.hashes[ev.eid] = ev;
    };

    this.event = function (eid) {
        return this.hashes[eid];
    }

    this.lookup = function (name) {
        if (util.isString(name)) {
            if ( !this.namespace.hasOwnProperty(name) ) {
                this.namespace[name] = new AccessLog();
            }

            return this.namespace[name];
        }
        
        helper.ERROR('lookup can only do string searching!');
    }

    this.searchObj = function (obj) {
        if (util.isObject(obj)) {
            var i = this.objectspace.indexOf(obj);
            if (i < 0) {
                this.objectspace.push(obj);
                this.shadowspace.push( new AccessLog() );
                i = this.objectspace.indexOf(obj);
            }

            helper.CHECK(i >= 0, "at searchObj()");

            return this.shadowspace[i];
        }

        helper.ERROR('search can only accept objects!');
    }

    this.readName = function (eid, name) {
        var access = this.lookup(name);

        if (access.hasRAW()) {
            this.hashes[access.writer].addDependence(eid);
        }
        access.read(eid);

    };

    this.writeName = function (eid, name) {
        var access = this.lookup(name);
        access.write(eid);
    };

    this.numOfRAW = function (evA, evB) {
        CHECK(evA.eid > evB.eid); // make sure A is strictly after B

        var deps = 0;
        for (var i in evA.readSet) {
            var obj = evA.readSet[i];
            var last = true;

            for (var x = evB.eid + 1; x <= evA.eid; x++) {
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
                console.log('==========================================================');
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
            }

            return {result: val};
        };
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return {base: base, offset: offset, val: val, skip: false};
        };
        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            if (enableTracking) {
                etab.pushEventWrite(activeEvent.eid, base);
            }

            return {result: val};
        };
        this.read = function (iid, name, val, isGlobal, isScriptLocal) {
            if (enableTracking) {
                DEBUG('read < ' + name);
                etab.pushEventRead(activeEvent.eid, name);
            }

            return {result: val};
        };
        this.write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
            if (enableTracking) {
                DEBUG('write > ' + name);
                etab.pushEventWrite(activeEvent.eid, name);
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



