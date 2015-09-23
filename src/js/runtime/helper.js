var debug = 1;

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
