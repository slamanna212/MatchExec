"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MATCH_FLOW_STEPS = void 0;
// Match progress constants
exports.MATCH_FLOW_STEPS = {
    created: { name: 'Creation', progress: 20 },
    gather: { name: 'Gather', progress: 40 },
    assign: { name: 'Assign', progress: 60 },
    battle: { name: 'Battle', progress: 80 },
    complete: { name: 'Complete', progress: 100 },
    cancelled: { name: 'Cancelled', progress: 0 }
};
