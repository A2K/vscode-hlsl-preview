
let logFunction = console.log;

function log()
{
    var args = [];
    for(var i = 0; i < arguments.length; ++i) args.push(arguments[i]);
    logFunction((args.map(arg => {
        if (typeof(arg) === 'object') return JSON.stringify(arg);
        return arg;
    })).join(' '));
}

console.log = log;
