function timeLog(log) {
    return function () {
        const first_parameter = arguments[0];
        const other_parameters = Array.prototype.slice.call(arguments, 1);
        function formatConsoleDate(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();
            const hour = date.getHours();
            const minutes = date.getMinutes();
            const seconds = date.getSeconds();
            const milliseconds = date.getMilliseconds();
            return '[' +
                    year + '-' +
                    ((day < 10) ? '0' + day : day) + '-' +
                    ((month < 10) ? '0' + month : month) + ' ' +
                    ((hour < 10) ? '0' + hour : hour) + ':' +
                    ((minutes < 10) ? '0' + minutes : minutes) + ':' +
                    ((seconds < 10) ? '0' + seconds : seconds) + '.' +
                    ('00' + milliseconds).slice(-3) +
                '] ';
        }
        log.apply(console, [formatConsoleDate(new Date()) + first_parameter].concat(other_parameters));
    }
}
function getTime () {
    const date = new Date()
    const y = date.getFullYear()
    const mo = date.getMonth() + 1
    const d = date.getDate()
    const h = date.getHours()
    const m = date.getMinutes()
    const s = date.getSeconds()
    return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d) + ' ' + (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}
function getDate (date) {
    date=date?date:(new Date());
    const y = date.getFullYear()
    const mo = date.getMonth() + 1
    const d = date.getDate()
    return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
}
function getPRDate (n=1) {
    let date = new Date();
    date=date.setDate(date.getDate()-n);
    date=new Date(date);
    return getDate(date).replace(/-/g,'');
}
module.exports={
    timeLog: timeLog,
    getTime: getTime,
    getDate: getDate,
    getPRDate: getPRDate
}