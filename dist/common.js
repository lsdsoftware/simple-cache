"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throttle = void 0;
function throttle(fn, interval) {
    let last = Date.now();
    return () => {
        const now = Date.now();
        if (now - last > interval) {
            last = now;
            fn();
        }
    };
}
exports.throttle = throttle;
