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

function ignore(ref) {
    return ref === undefined || ref === null || !util.isObject(ref);
}

function notIgnore(ref) {
    return ref !== undefined && ref !== null && util.isObject(ref);
}


var currentScope = helper.__GLOBAL_SCOPE__;
var scopeStack = [];

var plotRAW = true;
var plotCTL = true;


function EventTable() {
    this.hashes = {}; // all event logs, key is eid and value is the EventLog object
    // this.namespace = {}; // the name space for all variables, the key will be a var name while value is a descriptor object
    this.objectspace = []; // the array where we put a object
    this.shadowspace = []; // the array for annotator of all objects
                          // theobjectspace and shadowspace always have the same size

    this.insert = function (ev) {
        this.hashes[ev.eid] = ev;
    };

    this.event = function (eid) {
        return this.hashes[eid];
    };

    this.lookup = function (name) {
        if (util.isString(name)) {
            return currentScope.lookup(name);
        }
        
        helper.ERROR('lookup can only do string searching!');
    };

    this.searchObj = function (obj) {
        if (util.isObject(obj)) {
            var i = this.objectspace.indexOf(obj);
            if (i < 0) {
                this.objectspace.push(obj);
                this.shadowspace.push( new helper.AccessLog() );
                i = this.objectspace.indexOf(obj);
            }

            helper.CHECK(i >= 0, "at searchObj()");

            return this.shadowspace[i];
        }

        helper.ERROR('search can only accept objects!');
    };

    this.readName = function (eid, name, loc) {
        var access = this.lookup(name);
        if (access === null) return;

        if (access.hasRAW(eid)) {
            this.hashes[access.writer].addDependence(eid, name, loc);
        }
        access.read(eid);

    };

    this.writeName = function (eid, name, loc) {
        var access = this.lookup(name);
        if (access === null) return;

        if (access.hasWAW(eid)) {
            this.hashes[access.writer].addDependence(eid, name, loc);
        }
        if (access.hasWAR(eid)) {
            this.hashes[access.reader].addDependence(eid, name, loc);
        }
        access.write(eid);
    };

    this.readObj = function (eid, obj) {
        if (ignore(obj))
            return;

        var access = this.searchObj(obj);

        if (access.hasRAW(eid)) {
            this.hashes[access.writer].addDependence(eid, ':');
        }
        access.read(eid);
    };

    this.writeObj = function (eid, obj) {
        if (ignore(obj))
            return;

        var access = this.searchObj(obj);
        if (access.hasWAW(eid)) {
            this.hashes[access.writer].addDependence(eid, ':');
        }
        if (access.hasWAR(eid)) {
            this.hashes[access.reader].addDependence(eid, ':');
        }
        access.write(eid);
    };

    // target has a CTL dependence in source, e.g., source -> target
    this.addCTLdependence = function (source, target) {
        if (source >= 0 && source != target) { 
            this.hashes[source].addCTLDependence(target);
        }
    };

    this.generateDAG = function (etab) {
        var dot = "digraph edg {\n";
        var weights = "";

        var i = 0, j = 0, ne = helper.EventLog.counter;

        for (i = 0; i < ne; i++) {
            var cur = etab.hashes[i];
            // helper.DEBUG(i + ' :is: ' + cur.type);
            var deps = cur.dependences;
            dot = dot + i + " [ color=" + cur.color + " , style=filled, fontcolor=grey ];\n";
            weights = weights + i + '\t' + cur.ctlInst + '\n';

            if (plotRAW)
            for (var k in deps) {
                // DEBUG('ref> ' + ref.readSet.length);
                var num = deps[k].val;
                var label = deps[k].tag;

                if (num > 0) {
                    // there is RAW edge for (i, k)
                    var penwidth = num;
                    if (penwidth > 4.0) penwidth = 4.0;
                
                    var edge = "" + i + "->" + k +
                               " [ label=\"" + num + "/" + label + "\", penwidth=" + penwidth + " ];\n";
                    dot = dot + edge;
                }
            }

            var ctldeps = cur.CTLdependences;
            // if (plotCTL)
            for (var kk in ctldeps) {
                var num = ctldeps[kk].val;
                var label = '';

                if (num > 0) {
                    // there is CTL edge for (i, k)
                    var penwidth = 2.0;
                
                    var edge = "" + i + "->" + kk +
                               " [ penwidth=" + penwidth + ", style=dashed ];\n";
                    dot = dot + edge;
                }
            }
        }

        dot = dot + "}\n";

        var file = require("fs");
        console.log("Start Ploting...\n"); 
        file.writeFileSync("dependence.dot", dot);
        file.writeFileSync("weights.txt", weights);
        console.log("Done ..."); 

    };

}

var enableTracking = false;
var activeEvent = helper.noev;
var etab = new EventTable();
var listab = new helper.ListenerTable();
var numOfHiddenEvents = 0;
var sched = false;

(function (sandbox) {

    function MyAnalysis() {
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid) {
            // console.log('call ' + f.name + ' ' + iid);
            if (enableTracking) {
                activeEvent.ctlInst++;
            }

            var fname = f.name;
            if (fname === 'pin_addListener') {
                var type = args[0];
                var recv = args[1];
                var cb = args[2];
                var evid = -1;

                if (activeEvent !== helper.noev) {
                    evid = activeEvent.eid;
                }

                // if (evid >= 0) {
                    listab.register(evid, type, recv, cb);
                // }
                helper.DEBUG(fname + ':' + listab.toListenerId(type, recv));
                
            }

            if (fname === 'pin_removeListener') {
                var type = args[0];
                var recv = args[1];
                var cb = args[2];
                helper.DEBUG(fname + ':' + listab.toListenerId(type, recv));
                listab.unregister(type, recv, cb);
            }

            if (fname === 'emit') {
                // helper.DEBUG('emit> ' + args[0] + ' ' + sandbox.iidToLocation(sandbox.sid, iid));
            }

            if (fname == 'pin_start') {
                var type = args[0];
                var recv = args[1];
                var cb_args = args[2];
                var id = listab.toListenerId(type, recv);

                if (enableTracking !== false) {
                    helper.DEBUG('------------------' + type + '---------------------------------------');
                    numOfHiddenEvents++;
                    for (var arg in cb_args) {
                        if (notIgnore(cb_args[arg]))
                            etab.writeObj(activeEvent.eid, cb_args[arg]); // FIXME: The args should be thought of write!
                    }
                    // return {f: f, base: base, args: args, skip: false};
                } else {

                    helper.CHECK(enableTracking === false, 'No nested pin_start() for ' + type);

                    enableTracking = true;
                    activeEvent = new helper.EventLog( id, helper.getColor(type) );
                    etab.insert(activeEvent);
                    for (var arg in cb_args) {
                        if (notIgnore(cb_args[arg]))
                            etab.writeObj(activeEvent.eid, cb_args[arg]); // FIXME: The args should be thought of write!
                    }

                    helper.DEBUG('===================' + id + '=======================================');
                    helper.DEBUG('New Eve: ' + activeEvent.eid);
                }

                if (listab.isRegistered(type, recv)) {
                    var registers = listab.getRegisterEvents(type, recv);

                    for (var reg in registers) {
                        helper.DEBUG(registers[reg] + "------>" + activeEvent.eid);
                        etab.addCTLdependence(registers[reg], activeEvent.eid);
                    }
                }
            }

            if (fname == 'pin_end') {
                helper.CHECK(numOfHiddenEvents >= 0, 'numOfHiddenEvent < 0 ');
                if (numOfHiddenEvents > 0) {
                    numOfHiddenEvents--;
                    return {f: f, base: base, args: args, skip: false};
                }

                helper.DEBUG('**********************elapsed < ' + activeEvent.ctlInst + ' >branches *******************');
                enableTracking = false;
                activeEvent = helper.noev;
                helper.CHECK(numOfHiddenEvents === 0, 'No nested pin_end() !!!!');
                // etab.generateDAG();
                if (!sched) {
                    sched = true;
                    setInterval(etab.generateDAG, 10 * 1000, etab); 
                }
            }
            return {f: f, base: base, args: args, skip: false};
        };
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid) {
            return {result: result};
        };
        this.forinObject = function (iid, val) {
            return {result: val};
        };
        this.literal = function (iid, val, hasGetterSetter) {
            if (util.isFunction(val)) {
                 // helper.DEBUG('literal Funct>');

                 if (!currentScope.isGlobal()) {
                     // I am not in global, hence a new closure
                     var etc = {};
                     etc["iid"] = iid;
                     var clos = helper.closet.newClosure(val, currentScope, etc);
                 }

            }
            return {result: val};
        };
        this.forinObject = function (iid, val) {
            return {result: val};
        };
        this.declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {
            // if (!currentScope.isGlobal()) 
            currentScope.declare(name);

            if (enableTracking) {
                etab.writeName(activeEvent.eid, name);
            }

            return {result: val};
        };
        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            return {base: base, offset: offset, skip: false};
        };
        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            if (enableTracking) {
                etab.readObj(activeEvent.eid, base);
            }

            return {result: val};
        };
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return {base: base, offset: offset, val: val, skip: false};
        };
        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            if (enableTracking) {
                etab.writeObj(activeEvent.eid, base);
            }

            return {result: val};
        };
        this.read = function (iid, name, val, isGlobal, isScriptLocal) {
            if (enableTracking) {
                // helper.DEBUG('read < ' + name);
                etab.readName(activeEvent.eid, name, sandbox.iidToLocation(sandbox.sid, iid));
            }

            return {result: val};
        };
        this.write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
            if (enableTracking) {
                // helper.DEBUG('write > ' + name);
                etab.writeName(activeEvent.eid, name, sandbox.iidToLocation(sandbox.sid, iid));
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

            var scope = helper.newScope(f);
            // console.log(sandbox.iidToLocation(sandbox.sid, iid));
            // helper.DEBUG("FE Leave << " + currentScope.print());
            scopeStack.push(currentScope);
            currentScope = scope;
            // helper.DEBUG("FE Enter << " + currentScope.print());
        };
        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {

            // helper.DEBUG("FX Leave << " + currentScope.print());
            currentScope = scopeStack.pop();
            // helper.DEBUG("FX Enter << " + currentScope.print());
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
            if (enableTracking) {
                activeEvent.ctlInst++;
            }
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



