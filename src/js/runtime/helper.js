var debug = 1;
var util = require('util');

function DEBUG(str) {
    if (debug == 0)
         return;

    console.log('DEBUG: ' + str);
}
exports.DEBUG = DEBUG;

var colors = ["red", "grey", "blue", "green", "yellow", "pink", "purple", "orange", "brown"];
var evs = [];
function getColor(ev) {
    var idx = evs.indexOf(ev);
    if (idx < 0) {
        evs.push(ev);
        idx = evs.indexOf(ev);
    }

    return colors[idx % colors.length];
}
exports.getColor = getColor;

function ERROR(str) {
    console.log('ERROR: ' + str);
    process.exit(1);
}
exports.ERROR = ERROR;

function CHECK(b, msg) {
    if (!b) {
        ERROR("assert failed! " + msg);
    }
}
exports.CHECK = CHECK;

function hasKey(map ,key) {
    return map.hasOwnProperty(key);
}
exports.hasKey = hasKey;

function printName(obj) {
    if (util.isFunction(obj)) {
        return obj.name;
    }

    return "<unknown>";
}
exports.printName = printName;

// Here starts not-so-general definitions

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
        return this.writeBefore() && this.writer !== eid;
    }
}
exports.AccessLog = AccessLog;

function __GLOBAL_FP__() {}

function Scope(f, parent) {
    this.fp = f; // remember the function pointer
    this.parent = parent;

    this.isGlobal = function() {
        return this.fp === __GLOBAL_FP__ && parent === null;
    }

    this.namespace = {} // create a empty name space

    this.Name = printName(f); // N is in uppercase to avoid unnecessary trouble

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
                this.namespace[name] = new AccessLog();
                hasIt = true;
            }
            if (hasIt)
                return this.namespace[name];
            else
                return this.parent.lookup(name); // search the name in parent scope
        }
        
        ERROR('lookup can only do string searching!' + name);
    }

    this.declare = function(name) {
        var hasIt = false, createIt = true; 

        if (name == 'hasOwnProperty')
            return;
    
        if (util.isString(name)) {
            hasIt = this.namespace.hasOwnProperty(name);
            if ( !hasIt && createIt ) {
                this.namespace[name] = new AccessLog();
                hasIt = true;
            }

            return;
        }
        
        ERROR('declare can only do string insertion!' + name);
    }
}

var __GLOBAL_SCOPE__ = new Scope(__GLOBAL_FP__, null);
exports.__GLOBAL_SCOPE__ = __GLOBAL_SCOPE__;

function Closure(fp, parentScope, etc) {
    this.fp = fp; // For a scope a fp is not just a name/function pointer, it can be used to compare if two closure are the same, like a id.
    CHECK(parentScope !== null); 
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
exports.closet = closet;

function newScope(f) {
    var parent = __GLOBAL_SCOPE__, clos;
    if (closet.isClosure(f)) {
        clos = closet.getClosure(f);
        parent = clos.parentScope;
    } 

    var scp = new Scope(f, parent);
    return scp;
}
exports.newScope = newScope;


function EventLog(type, color) {
    if ( typeof EventLog.counter == 'undefined' ) {
        EventLog.counter = 0;
    }
    this.eid = EventLog.counter;
    this.type= type;
    EventLog.counter++;

    this.dependences = {}; // by dependences, it could only be a RAW dependence
    this.color = color;

    this.addDependence = function (eid, tag) {
        if ( !hasKey(this.dependences, eid) ) {
            this.dependences[eid] = { val : 0, tag : '' };
        }
        this.dependences[eid].val++;
        if (tag !== ':' && this.dependences[eid].tag.indexOf(tag) < 0)
            this.dependences[eid].tag = this.dependences[eid].tag + ':' + tag;
    };
}
exports.EventLog = EventLog;

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
exports.ListenerTable = ListenerTable;

var __NO_EVENT__ = -1;
exports.noev = __NO_EVENT__;

// ----------------------------------------------------------------------------------------------------------------------------------------------
// Here starts DRAFT functions, DO NOT use

function ArrayMap() {
    this.map = {};

    this.add = function (k, v) {
        if (!map.hasOwnProperty()) {
            map[k] = [];
        }
        map[k].push(v);
    };

    this.remove = function (k, v) {
        if (!map.hasOwnProperty(k)) {
            return;
        }
        var idx = map[k].indexOf(v);
        if (idx >= 0) {
            map[k].splice(idx, 1);
        }
    };

    this.removeByIndex = function (k, idx) {
        if (!map.hasOwnProperty(k)) {
            return;
        }
        if (idx >= 0 && idx < map[k].length) {
            map[k].splice(idx, 1);
        }
    };
    
    this.getIndex = function (k, v) {
        if (!map.hasOwnProperty(k)) {
            return;
        }
        var idx = map[k].indexOf(v);
        return idx;
    }

    this.hasV = function(k, v) {
        if (!map.hasOwnProperty(k)) {
            return false;
        }

        return map[k].indexOf(v) >= 0;
    };

    this.hasK = function(k) {
        if (!map.hasOwnProperty(k)) {
            return false;
        }

        return map[k].length > 0;
    };

    this.getV = function(k) {
        var res = [];
        if (!this.hasK(k)) return res;

        for (var i in map[k]) {
            res.push(map[k][i]);
        }

        return res;
    };
}

