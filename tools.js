function addZero (number, count) {
    number = number.toString();
    while (number.length < count) {
        number = "0" + number;
    }
    return number;
}

function parse (time, format, count=5) {
    const units = new Map();
    units.set('ms', 1000);
    units.set('s', 60);
    units.set('m', 60);
    units.set('h', 24);
    units.set('d', 7);
    var temp;
    var i = 0;
    for (const unit of units.keys()) {
        temp = units.get(unit)
        format = format.replaceAll(`%${unit}`, addZero(time % temp, i === 0 ? 3 : temp.toString().length));
        time = (time - (time % temp)) / temp;
        if (i++ === count) break;
    }
    return format.replaceAll('%w', time);
}

module.exports = {
    parse: parse
};