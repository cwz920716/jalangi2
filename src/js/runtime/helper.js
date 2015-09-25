var debug = 1;
var util = require('util');

function DEBUG(str) {
    if (debug == 0)
         return;

    console.log('DEBUG: ' + str);
}
exports.DEBUG = DEBUG;

var colors = ['red', 'blue', 'green', 'purple', 'black'];
function getColor(id) {
    return colors[id % colors.length];
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
        return this.writeBefore() && this.writer < eid;
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




