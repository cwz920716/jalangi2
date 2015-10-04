var debug = 1;
var util = require('util');

function DEBUG(str) {
    if (debug == 0)
         return;

    console.log('DEBUG: ' + str);
}
exports.DEBUG = DEBUG;

var colors = ["red", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "AliceBlue", "AntiqueWhite", "Bisque", "BlueViolet", "BurlyWood", "CadetBlue", "Chocolate",
              "Crimson", "Cyan", "Maroon", "Magenta", 
              "black"];
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

        if (name === 'hasOwnProperty')
            return null;

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

        if (name === 'hasOwnProperty')
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
    this.CTLdependences = {}; // the event-listen/emit dependence
    this.color = color;

    this.addDependence = function (eid, tag, msg) {
        if ( !hasKey(this.dependences, eid) ) {
            this.dependences[eid] = { val : 0, tag : '' };
        }
        this.dependences[eid].val++;
        if (tag !== ':' && this.dependences[eid].tag.indexOf(tag) < 0)
            this.dependences[eid].tag = this.dependences[eid].tag + ':' + tag; // + msg;
    };

    this.addCTLDependence = function (eid) {
        if ( !hasKey(this.CTLdependences, eid) ) {
            this.CTLdependences[eid] = { val : 0, tag : '' };
        }
        this.CTLdependences[eid].val++;
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
    this.cbMap = new ArrayMap();
    this.ownerMap = new ArrayMap();
    this.rset = new recvSet();

    this.toListenerId = function (type, recv) {
        if (this.rset.has(recv)) {
            var idx = this.rset.getIndex(recv);
            return '__' + type + '_' + idx + '__';
        } else
            return null;
    };

    this.register = function (eid, type, recv, cb) {
        this.rset.add(recv);
        var id = this.toListenerId(type, recv);

        if (this.isRegistered(type, recv)) {
            // DEBUG(id + 'is Registtttttttttttttttered!');
        }

        this.cbMap.add(id, cb);
        this.ownerMap.add(id, eid);
    };

    this.unregister = function (type, recv, cb) {
        var id = this.toListenerId(type, recv);

        if (!this.isRegistered(type, recv)) {
            DEBUG(id + 'is UNRegisttttttttttttttttered!');
            return;
        }

        var idx = this.cbMap.getIndex(id, cb);
        this.cbMap.removeByIndex(id, idx);
        this.ownerMap.removeByIndex(id, idx);
    };

    this.isRegistered = function (type, recv) {
        var id = this.toListenerId(type, recv);
        if (id === null)
            return false;
        else
            return this.cbMap.hasK(id);
    };

    this.getRegisterEvents = function (type, recv) {
        var id = this.toListenerId(type, recv);
        return this.ownerMap.getVs(id);
    };

}
exports.ListenerTable = ListenerTable;

var __NO_EVENT__ = -1;
exports.noev = __NO_EVENT__;

function ArrayMap() {
    this.amap = {};

    this.hasK = function(k) {
        var map = this.amap;
        if (!map.hasOwnProperty(k)) {
            return false;
        }

        return map[k].length > 0;
    };
    
    // return hasK() & has V
    this.getIndex = function (k, v) {
        var map = this.amap;
        if (!this.hasK(k)) {
            return -1;
        }
        var idx = map[k].indexOf(v);
        return idx;
    };

    this.hasV = function(k, v) {
        var map = this.amap;
        return this.getIndex(k, v) >= 0;
    };

    this.add = function (k, v) {
        var map = this.amap;

        if (!this.hasK(k)) {
            map[k] = [];
        }
        map[k].push(v);
    };

    this.removeByIndex = function (k, idx) {
        var map = this.amap;
        if (!this.hasK(k)) {
            return;
        }
        if (idx >= 0 && idx < map[k].length) {
            map[k].splice(idx, 1);
        } else
            ERROR('Arraymap do not has that idx!');
    };

    this.getVs = function(k) {
        var map = this.amap;
        var res = [];
        if (!this.hasK(k)) return res;

        for (var i in map[k]) {
            res.push(map[k][i]);
        }

        return res;
    };
}

