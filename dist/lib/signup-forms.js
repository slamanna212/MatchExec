"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignupFormLoader = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var SignupFormLoader = /** @class */ (function () {
    function SignupFormLoader() {
    }
    SignupFormLoader.loadSignupForm = function (gameId) {
        return __awaiter(this, void 0, void 0, function () {
            var signupPath, signupData;
            return __generator(this, function (_a) {
                // Check cache first
                if (this.cache.has(gameId)) {
                    return [2 /*return*/, this.cache.get(gameId)];
                }
                try {
                    signupPath = path_1.default.join(process.cwd(), 'data', 'games', gameId, 'signup.json');
                    if (!fs_1.default.existsSync(signupPath)) {
                        console.warn("\u26A0\uFE0F No signup form found for game: ".concat(gameId));
                        return [2 /*return*/, this.getDefaultSignupForm()];
                    }
                    signupData = JSON.parse(fs_1.default.readFileSync(signupPath, 'utf-8'));
                    // Validate the signup form structure
                    if (!this.isValidSignupForm(signupData)) {
                        console.error("\u274C Invalid signup form structure for game: ".concat(gameId));
                        return [2 /*return*/, this.getDefaultSignupForm()];
                    }
                    // Cache the form
                    this.cache.set(gameId, signupData);
                    console.log("\u2705 Loaded signup form for game: ".concat(gameId));
                    return [2 /*return*/, signupData];
                }
                catch (error) {
                    console.error("\u274C Error loading signup form for ".concat(gameId, ":"), error);
                    return [2 /*return*/, this.getDefaultSignupForm()];
                }
                return [2 /*return*/];
            });
        });
    };
    SignupFormLoader.isValidSignupForm = function (data) {
        return (data &&
            Array.isArray(data.fields) &&
            data.fields.every(function (field) {
                return field.id &&
                    field.type &&
                    ['text', 'largetext'].includes(field.type) &&
                    field.label &&
                    typeof field.required === 'boolean';
            }) &&
            data.submitButton &&
            data.submitButton.text);
    };
    SignupFormLoader.getDefaultSignupForm = function () {
        return {
            fields: [
                {
                    id: 'username',
                    type: 'text',
                    label: 'In-game Username',
                    placeholder: 'Enter your in-game username',
                    required: true
                },
                {
                    id: 'notes',
                    type: 'largetext',
                    label: 'Additional Notes (Optional)',
                    placeholder: 'Any additional information or preferences',
                    required: false
                }
            ],
            submitButton: {
                text: 'Sign Up',
                loadingText: 'Joining...'
            }
        };
    };
    SignupFormLoader.clearCache = function (gameId) {
        if (gameId) {
            this.cache.delete(gameId);
        }
        else {
            this.cache.clear();
        }
    };
    SignupFormLoader.cache = new Map();
    return SignupFormLoader;
}());
exports.SignupFormLoader = SignupFormLoader;
