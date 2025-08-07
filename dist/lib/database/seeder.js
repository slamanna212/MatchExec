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
exports.DatabaseSeeder = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var DatabaseSeeder = /** @class */ (function () {
    function DatabaseSeeder(db, dataDir) {
        if (dataDir === void 0) { dataDir = './data/games'; }
        this.db = db;
        this.dataDir = dataDir;
    }
    DatabaseSeeder.prototype.seedDatabase = function () {
        return __awaiter(this, void 0, void 0, function () {
            var gameDirectories, _i, gameDirectories_1, gameDir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('Starting database seeding...');
                        gameDirectories = this.getGameDirectories();
                        _i = 0, gameDirectories_1 = gameDirectories;
                        _a.label = 1;
                    case 1:
                        if (!(_i < gameDirectories_1.length)) return [3 /*break*/, 4];
                        gameDir = gameDirectories_1[_i];
                        return [4 /*yield*/, this.seedGame(gameDir)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        console.log('Database seeding completed');
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseSeeder.prototype.getGameDirectories = function () {
        var _this = this;
        if (!fs_1.default.existsSync(this.dataDir)) {
            console.log('No games data directory found');
            return [];
        }
        return fs_1.default.readdirSync(this.dataDir)
            .filter(function (dir) { return fs_1.default.statSync(path_1.default.join(_this.dataDir, dir)).isDirectory(); });
    };
    DatabaseSeeder.prototype.seedGame = function (gameDir) {
        return __awaiter(this, void 0, void 0, function () {
            var gamePath, gameJsonPath, gameData, existingVersion, modesPath, modesContent, modesData, mapsPath, mapsContent, mapsData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        gamePath = path_1.default.join(this.dataDir, gameDir);
                        gameJsonPath = path_1.default.join(gamePath, 'game.json');
                        if (!fs_1.default.existsSync(gameJsonPath)) {
                            console.log("No game.json found for ".concat(gameDir, ", skipping"));
                            return [2 /*return*/];
                        }
                        gameData = JSON.parse(fs_1.default.readFileSync(gameJsonPath, 'utf8'));
                        return [4 /*yield*/, this.getExistingDataVersion(gameData.id)];
                    case 1:
                        existingVersion = _a.sent();
                        if (existingVersion === gameData.dataVersion) {
                            console.log("Game ".concat(gameData.id, " already seeded with version ").concat(gameData.dataVersion, ", skipping"));
                            return [2 /*return*/];
                        }
                        console.log("Seeding game: ".concat(gameData.name, " (").concat(gameData.id, ")"));
                        // Seed game data
                        return [4 /*yield*/, this.seedGameData(gameData)];
                    case 2:
                        // Seed game data
                        _a.sent();
                        modesPath = path_1.default.join(gamePath, 'modes.json');
                        if (!fs_1.default.existsSync(modesPath)) return [3 /*break*/, 4];
                        modesContent = fs_1.default.readFileSync(modesPath, 'utf8').trim();
                        if (!modesContent) return [3 /*break*/, 4];
                        modesData = JSON.parse(modesContent);
                        return [4 /*yield*/, this.seedModes(gameData.id, modesData)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        mapsPath = path_1.default.join(gamePath, 'maps.json');
                        if (!fs_1.default.existsSync(mapsPath)) return [3 /*break*/, 6];
                        mapsContent = fs_1.default.readFileSync(mapsPath, 'utf8').trim();
                        if (!mapsContent) return [3 /*break*/, 6];
                        mapsData = JSON.parse(mapsContent);
                        return [4 /*yield*/, this.seedMaps(gameData.id, mapsData)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: 
                    // Update data version
                    return [4 /*yield*/, this.updateDataVersion(gameData.id, gameData.dataVersion)];
                    case 7:
                        // Update data version
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseSeeder.prototype.getExistingDataVersion = function (gameId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.get('SELECT data_version FROM data_versions WHERE game_id = ?', [gameId])];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, (result === null || result === void 0 ? void 0 : result.data_version) || null];
                }
            });
        });
    };
    DatabaseSeeder.prototype.seedGameData = function (gameData) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.run("\n      INSERT OR REPLACE INTO games (\n        id, name, color, genre, developer, release_date, version, description,\n        min_players, max_players, icon_url, cover_url, updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)\n    ", [
                            gameData.id,
                            gameData.name,
                            gameData.color || null,
                            gameData.genre,
                            gameData.developer,
                            gameData.releaseDate,
                            gameData.patch,
                            gameData.description,
                            gameData.minPlayers,
                            gameData.maxPlayers,
                            gameData.assets.iconUrl,
                            gameData.assets.coverUrl || null
                        ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseSeeder.prototype.seedModes = function (gameId, modesData) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, modesData_1, mode;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Clear existing modes for this game
                    return [4 /*yield*/, this.db.run('DELETE FROM game_modes WHERE game_id = ?', [gameId])];
                    case 1:
                        // Clear existing modes for this game
                        _a.sent();
                        _i = 0, modesData_1 = modesData;
                        _a.label = 2;
                    case 2:
                        if (!(_i < modesData_1.length)) return [3 /*break*/, 5];
                        mode = modesData_1[_i];
                        return [4 /*yield*/, this.db.run("\n        INSERT INTO game_modes (id, game_id, name, description, updated_at)\n        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)\n      ", [mode.id, gameId, mode.name, mode.description])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseSeeder.prototype.seedMaps = function (gameId, mapsData) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, mapsData_1, map, modeId, imageUrl;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Clear existing maps for this game
                    return [4 /*yield*/, this.db.run('DELETE FROM game_maps WHERE game_id = ?', [gameId])];
                    case 1:
                        // Clear existing maps for this game
                        _a.sent();
                        _i = 0, mapsData_1 = mapsData;
                        _a.label = 2;
                    case 2:
                        if (!(_i < mapsData_1.length)) return [3 /*break*/, 5];
                        map = mapsData_1[_i];
                        modeId = map.type.toLowerCase();
                        if (modeId === 'doom match') {
                            modeId = 'doom-match';
                        }
                        imageUrl = map.thumbnailUrl || null;
                        if (imageUrl && imageUrl.startsWith('/public/')) {
                            imageUrl = imageUrl.replace('/public/', '/');
                        }
                        return [4 /*yield*/, this.db.run("\n        INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)\n        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)\n      ", [map.id, gameId, map.name, modeId, imageUrl, map.location || null])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseSeeder.prototype.updateDataVersion = function (gameId, dataVersion) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.run("\n      INSERT OR REPLACE INTO data_versions (game_id, data_version, seeded_at)\n      VALUES (?, ?, CURRENT_TIMESTAMP)\n    ", [gameId, dataVersion])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return DatabaseSeeder;
}());
exports.DatabaseSeeder = DatabaseSeeder;
