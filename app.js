const server = require('acserver-plugin');
const config = require('./config');
const database = require('./db');
const tools = require('./tools');

const protocols = server.PROTOCOLS;

const app = new server.PluginApp({port: config.server.port, hostname: config.server.hostname});
const db = new database.DB();


app.on(protocols.NEW_CONNECTION, (data) => {
    const now = Date.now();  
    if (now < config.schedule.start || now > config.schedule.end) {
        app.kick(data.car_id);
        return;
    }
    db.newCar(data.car_id, {
        driver_guid: data.guid,
        name: data.name
    });
});

app.on(protocols.CLIENT_LOADED, (data) => {
    app.sendChat(data.car_id, "남은 경기 시간: " + tools.parse((config.schedule.end - Date.now()), "%w주 %d일 %h시간 %m분"));
    app.sendChat(data.car_id, "현재 세션의 남은 시간: " + tools.parse(db.sessionEnd - Date.now(), "%h시간 %m분 %s초", 4));
    app.sendChat(data.car_id, "현재 랩타임: " + tools.parse(db.getCar(data.car_id).best, "%m:%s.%ms", 3));
    app.sendChat(data.car_id, "1위 랩타임: " + tools.parse(db.trackbest.laptime, "%m:%s.%ms", 3));
    app.sendChat(data.car_id, "도움이 필요하시면 !도움을 입력하세요.")
});

app.on(protocols.CONNECTION_CLOSED, (data) => {
    db.saveLaps(data.car_id);
    db.reset(data.car_id);
});

app.on(protocols.CAR_INFO, (data) => {
    if (!data.connected) return; 
    db.newCar(data.car_id, {
        driver_guid: data.guid,
        name: data.name
    });
});

app.on(protocols.CHAT, (data) => {
    const msg = data.message;
    if (msg[0] !== config.cmdPrefix) return; 
    const cmd = msg.slice(1).split(' ')[0]
    switch (cmd) {
        case '도움':
            app.sendChat(data.car_id, '!베랩, !패랩, !순위, !남은시간')
            break;
        case '베랩':
            const best = db.getCar(data.car_id).best;
            if (best === 0) app.sendChat(data.car_id, '기록 없음');
            else app.sendChat(data.car_id, '내 랩타임: ' + tools.parse(best, "%m:%s.%ms", 3));
            break;
        case '패랩':
            if (db.trackbest.laptime === 0) app.sendChat(data.car_id, "기록 없음");
            else app.sendChat(data.car_id, "1위 랩타임: " + tools.parse(db.trackbest.laptime, "%m:%s.%ms", 3) + ' by ' + db.trackbest.name);
            break;
        case '남은시간':
            app.sendChat(data.car_id, "남은 경기 시간: " + tools.parse((config.schedule.end - Date.now()), "%w주 %d일 %h시간 %m분"));
            app.sendChat(data.car_id, "현재 세션의 남은 시간: " + tools.parse(db.sessionEnd - Date.now(), "%h시간 %m분 %s초", 4));
            break;
        case 'save':
            if (config.managerGuids.includes(db.getCar(data.car_id).guid)) {
                for (const car of db.cars) {
                    if (!car.guid) continue;
                    db.saveLaps(car.car_id);
                }
                app.sendChat(data.car_id, 'laps 저장 완료');
                break;
            }
        default:
            app.sendChat(data.car_id, '존재하지 않거나 준비중인 명령어입니다.')
    }
})

app.on(protocols.SESSION_INFO, (data) => {
    db.set('sessionLength', data.time * 60 * 1000);
    db.set('sessionEnd', Date.now() + data.time * 60 * 1000 - data.elapsed_time);
    db.set('sessionStart', Date.now() - data.elapsed_time);
    db.set('currentSession', data.current_sess_index);
});
app.on(protocols.NEW_SESSION, app.listeners[protocols.SESSION_INFO.toString()]);

app.on(protocols.LAP_COMPLETED, (data) => {
    const car = db.getCar(data.car_id);
    car.completeLap();
    if (data.cuts === 0) {
        if (car.best > data.laptime && car.best !== 0) return;
        db.savePersonalBest(data.car_id, car.driver_guid, car.name, car.laps, data.laptime);
        app.sendChat(data.car_id, '개인 베스트 랩타임 갱신: ' + tools.parse(data.laptime, "%m:%s.%ms", 3));
        if (db.trackbest !== undefined && db.trackbest.laptime > data.laptime) return;
        db.saveTrackBest(car.driver_guid, car.name, car.laps, data.laptime);
        app.broadcastChat('전체 베스트 랩타임 갱신: ' + tools.parse(data.laptime, "%m:%s.%ms", 3) + ' by ' + car.name);
    } else {
        db.saveTrackLeave(data.car_id, data.cuts);
    }
});

app.on(protocols.CLIENT_EVENT, (data) => {
    if (data.type === protocols.CE_COLLISION_WITH_ENV) return;
    db.saveAccident(data.car_id, data.other_car_id, data.speed, data.world_position, data.rel_position);
    app.sendChat(data.car_id, '다른 드라이버와의 충돌이 다수 발생시 경기 종료 후 페널티가 부과될 수 있습니다. 주의하시기 바랍니다.')
});


app.run(12001);
app.getSessionInfo();
app.getCarInfo();