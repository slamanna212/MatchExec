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
exports.MatchExecBot = void 0;
var discord_js_1 = require("discord.js");
var database_1 = require("../../lib/database");
var MatchExecBot = /** @class */ (function () {
    function MatchExecBot() {
        this.db = null;
        this.settings = null;
        this.isReady = false;
        this.client = new discord_js_1.Client({
            intents: [
                discord_js_1.GatewayIntentBits.Guilds,
                discord_js_1.GatewayIntentBits.GuildMessages,
                discord_js_1.GatewayIntentBits.MessageContent,
                discord_js_1.GatewayIntentBits.GuildMembers,
            ],
        });
        this.setupEventListeners();
    }
    MatchExecBot.prototype.setupEventListeners = function () {
        var _this = this;
        this.client.once(discord_js_1.Events.ClientReady, function (readyClient) { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("\u2705 Discord bot ready! Logged in as ".concat(readyClient.user.tag));
                        this.isReady = true;
                        // Set bot status
                        (_a = this.client.user) === null || _a === void 0 ? void 0 : _a.setActivity('Match Management', { type: discord_js_1.ActivityType.Playing });
                        // Register slash commands
                        return [4 /*yield*/, this.registerSlashCommands()];
                    case 1:
                        // Register slash commands
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        this.client.on(discord_js_1.Events.InteractionCreate, function (interaction) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!interaction.isChatInputCommand()) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.handleSlashCommand(interaction)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 2:
                        if (!interaction.isButton()) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.handleButtonInteraction(interaction)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        if (!interaction.isModalSubmit()) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.handleModalSubmit(interaction)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [2 /*return*/];
                }
            });
        }); });
        this.client.on(discord_js_1.Events.Error, function (error) {
            console.error('❌ Discord client error:', error);
        });
        this.client.on(discord_js_1.Events.Warn, function (warning) {
            console.warn('⚠️ Discord client warning:', warning);
        });
        this.client.on(discord_js_1.Events.Debug, function (info) {
            if (process.env.NODE_ENV === 'development') {
                console.log('🐛 Discord debug:', info);
            }
        });
    };
    MatchExecBot.prototype.loadSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var settings, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db) {
                            console.error('❌ Database not initialized');
                            return [2 /*return*/, null];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.db.get("\n        SELECT \n          bot_token,\n          guild_id,\n          announcement_channel_id,\n          results_channel_id,\n          participant_role_id\n        FROM discord_settings \n        WHERE id = 1\n      ")];
                    case 2:
                        settings = _a.sent();
                        if (!(settings === null || settings === void 0 ? void 0 : settings.bot_token)) {
                            console.log('⚠️ No bot token found in database');
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, settings];
                    case 3:
                        error_1 = _a.sent();
                        console.error('❌ Error loading Discord settings:', error_1);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.registerSlashCommands = function () {
        return __awaiter(this, void 0, void 0, function () {
            var commands, rest, data, error_2;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!((_a = this.settings) === null || _a === void 0 ? void 0 : _a.bot_token) || !((_b = this.settings) === null || _b === void 0 ? void 0 : _b.guild_id)) {
                            console.warn('⚠️ Missing bot token or guild ID, skipping command registration');
                            return [2 /*return*/];
                        }
                        commands = [
                            new discord_js_1.SlashCommandBuilder()
                                .setName('status')
                                .setDescription('Check bot status and configuration'),
                            new discord_js_1.SlashCommandBuilder()
                                .setName('create-event')
                                .setDescription('Create a new match event')
                                .addStringOption(function (option) {
                                return option.setName('name')
                                    .setDescription('Event name')
                                    .setRequired(true);
                            })
                                .addStringOption(function (option) {
                                return option.setName('description')
                                    .setDescription('Event description')
                                    .setRequired(true);
                            })
                                .addStringOption(function (option) {
                                return option.setName('game')
                                    .setDescription('Game for this event')
                                    .setRequired(true);
                            })
                                .addStringOption(function (option) {
                                return option.setName('type')
                                    .setDescription('Event type')
                                    .setRequired(true)
                                    .addChoices({ name: 'Competitive', value: 'competitive' }, { name: 'Casual', value: 'casual' });
                            })
                                .addStringOption(function (option) {
                                return option.setName('maps')
                                    .setDescription('Comma-separated list of map names')
                                    .setRequired(false);
                            })
                                .addIntegerOption(function (option) {
                                return option.setName('max-participants')
                                    .setDescription('Maximum number of participants')
                                    .setRequired(false)
                                    .setMinValue(2)
                                    .setMaxValue(64);
                            })
                        ];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        rest = new discord_js_1.REST().setToken(this.settings.bot_token);
                        console.log('🔄 Started refreshing application (/) commands.');
                        return [4 /*yield*/, rest.put(discord_js_1.Routes.applicationGuildCommands(this.client.user.id, this.settings.guild_id), { body: commands })];
                    case 2:
                        data = _c.sent();
                        console.log("\u2705 Successfully reloaded ".concat(data.length, " application (/) commands."));
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _c.sent();
                        console.error('❌ Error registering slash commands:', error_2);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleSlashCommand = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var commandName, _a, error_3, errorMessage;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        commandName = interaction.commandName;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 9, , 14]);
                        _a = commandName;
                        switch (_a) {
                            case 'status': return [3 /*break*/, 2];
                            case 'create-event': return [3 /*break*/, 4];
                        }
                        return [3 /*break*/, 6];
                    case 2: return [4 /*yield*/, this.handleStatusCommand(interaction)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 4: return [4 /*yield*/, this.handleCreateEventCommand(interaction)];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, interaction.reply({
                            content: '❌ Unknown command.',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        })];
                    case 7:
                        _b.sent();
                        _b.label = 8;
                    case 8: return [3 /*break*/, 14];
                    case 9:
                        error_3 = _b.sent();
                        console.error('❌ Error handling slash command:', error_3);
                        errorMessage = '❌ An error occurred while processing your command.';
                        if (!(interaction.replied || interaction.deferred)) return [3 /*break*/, 11];
                        return [4 /*yield*/, interaction.followUp({ content: errorMessage, flags: discord_js_1.MessageFlags.Ephemeral })];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 11: return [4 /*yield*/, interaction.reply({ content: errorMessage, flags: discord_js_1.MessageFlags.Ephemeral })];
                    case 12:
                        _b.sent();
                        _b.label = 13;
                    case 13: return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleStatusCommand = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var uptime, uptimeString, status;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        uptime = process.uptime();
                        uptimeString = "".concat(Math.floor(uptime / 3600), "h ").concat(Math.floor((uptime % 3600) / 60), "m ").concat(Math.floor(uptime % 60), "s");
                        status = [
                            "\uD83E\uDD16 **MatchExec Bot Status**",
                            "\u2705 Bot Online",
                            "\u23F1\uFE0F Uptime: ".concat(uptimeString),
                            "\uD83C\uDFE0 Guild: ".concat(interaction.guildId),
                            "\uD83D\uDCE1 Ping: ".concat(this.client.ws.ping, "ms"),
                            "\uD83D\uDDC4\uFE0F Database: ".concat(this.db ? '✅ Connected' : '❌ Disconnected')
                        ].join('\n');
                        return [4 /*yield*/, interaction.reply({
                                content: status,
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleCreateEventCommand = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var name, description, game, type, mapList, maxParticipants, eventId, maps, embed, signupButton, row, targetChannelId, targetChannel, error_4;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        name = interaction.options.getString('name', true);
                        description = interaction.options.getString('description', true);
                        game = interaction.options.getString('game', true);
                        type = interaction.options.getString('type', true);
                        mapList = interaction.options.getString('maps') || '';
                        maxParticipants = interaction.options.getInteger('max-participants') || 16;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 11, , 13]);
                        eventId = "event_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        maps = mapList.split(',').map(function (map) { return map.trim(); }).filter(function (map) { return map.length > 0; });
                        return [4 /*yield*/, this.createEventEmbed(name, description, game, type, maps, maxParticipants)];
                    case 2:
                        embed = _b.sent();
                        signupButton = new discord_js_1.ButtonBuilder()
                            .setCustomId("signup_".concat(eventId))
                            .setLabel('🎮 Sign Up')
                            .setStyle(discord_js_1.ButtonStyle.Primary);
                        row = new discord_js_1.ActionRowBuilder()
                            .addComponents(signupButton);
                        if (!this.db) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.db.run("\n          INSERT INTO matches (id, name, description, game_id, guild_id, channel_id, max_participants, status)\n          VALUES (?, ?, ?, ?, ?, ?, ?, 'registration')\n        ", [eventId, name, description, game, interaction.guildId, interaction.channelId, maxParticipants])];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        targetChannelId = ((_a = this.settings) === null || _a === void 0 ? void 0 : _a.announcement_channel_id) || interaction.channelId;
                        return [4 /*yield*/, this.client.channels.fetch(targetChannelId)];
                    case 5:
                        targetChannel = _b.sent();
                        if (!(targetChannel === null || targetChannel === void 0 ? void 0 : targetChannel.isTextBased())) return [3 /*break*/, 8];
                        return [4 /*yield*/, targetChannel.send({
                                embeds: [embed],
                                components: [row]
                            })];
                    case 6:
                        _b.sent();
                        return [4 /*yield*/, interaction.reply({
                                content: "\u2705 Event \"".concat(name, "\" has been created and posted!"),
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 7:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 8: return [4 /*yield*/, interaction.reply({
                            content: '❌ Could not find the announcement channel.',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        })];
                    case 9:
                        _b.sent();
                        _b.label = 10;
                    case 10: return [3 /*break*/, 13];
                    case 11:
                        error_4 = _b.sent();
                        console.error('❌ Error creating event:', error_4);
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ Failed to create event. Please try again.',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.createEventEmbed = function (name, description, game, type, maps, maxParticipants) {
        return __awaiter(this, void 0, void 0, function () {
            var embed, mapText, _i, maps_1, mapName, mapData, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        embed = new discord_js_1.EmbedBuilder()
                            .setTitle("\uD83C\uDFAE ".concat(name))
                            .setDescription(description)
                            .setColor(type === 'competitive' ? 0xff6b35 : 0x4caf50)
                            .addFields({ name: '🎯 Game', value: game, inline: true }, { name: '🏆 Type', value: type === 'competitive' ? '🥇 Competitive' : '🎮 Casual', inline: true }, { name: '👥 Max Players', value: maxParticipants.toString(), inline: true })
                            .setTimestamp()
                            .setFooter({ text: 'MatchExec • Sign up to participate!' });
                        if (!(maps.length > 0)) return [3 /*break*/, 9];
                        mapText = '';
                        _i = 0, maps_1 = maps;
                        _a.label = 1;
                    case 1:
                        if (!(_i < maps_1.length)) return [3 /*break*/, 8];
                        mapName = maps_1[_i];
                        if (!this.db) return [3 /*break*/, 6];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.db.get("\n              SELECT name, image_url FROM game_maps \n              WHERE LOWER(name) LIKE LOWER(?) \n              LIMIT 1\n            ", ["%".concat(mapName, "%")])];
                    case 3:
                        mapData = _a.sent();
                        if (mapData === null || mapData === void 0 ? void 0 : mapData.image_url) {
                            mapText += "**".concat(mapData.name, "**\n");
                            // Use first map image as thumbnail if available
                            if (!embed.data.thumbnail && mapData.image_url) {
                                embed.setThumbnail(mapData.image_url);
                            }
                        }
                        else {
                            mapText += "**".concat(mapName, "**\n");
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_5 = _a.sent();
                        mapText += "**".concat(mapName, "**\n");
                        return [3 /*break*/, 5];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        mapText += "**".concat(mapName, "**\n");
                        _a.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 1];
                    case 8:
                        embed.addFields({ name: '🗺️ Maps', value: mapText || 'Maps will be announced', inline: false });
                        _a.label = 9;
                    case 9: return [2 /*return*/, embed];
                }
            });
        });
    };
    MatchExecBot.prototype.handleButtonInteraction = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var eventId, existingParticipant, participantCount, eventData, modal, usernameInput, notesInput, firstRow, secondRow, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!interaction.customId.startsWith('signup_'))
                            return [2 /*return*/];
                        eventId = interaction.customId.replace('signup_', '');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 10, , 12]);
                        if (!this.db) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.db.get("\n          SELECT id FROM match_participants \n          WHERE match_id = ? AND user_id = ?\n        ", [eventId, interaction.user.id])];
                    case 2:
                        existingParticipant = _a.sent();
                        if (!existingParticipant) return [3 /*break*/, 4];
                        return [4 /*yield*/, interaction.reply({
                                content: '✅ You are already signed up for this event!',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                    case 4: return [4 /*yield*/, this.db.get("\n          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?\n        ", [eventId])];
                    case 5:
                        participantCount = _a.sent();
                        return [4 /*yield*/, this.db.get("\n          SELECT max_participants FROM matches WHERE id = ?\n        ", [eventId])];
                    case 6:
                        eventData = _a.sent();
                        if (!((participantCount === null || participantCount === void 0 ? void 0 : participantCount.count) >= ((eventData === null || eventData === void 0 ? void 0 : eventData.max_participants) || 16))) return [3 /*break*/, 8];
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ This event is full!',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 7:
                        _a.sent();
                        return [2 /*return*/];
                    case 8:
                        modal = new discord_js_1.ModalBuilder()
                            .setCustomId("signup_form_".concat(eventId))
                            .setTitle('Event Sign Up');
                        usernameInput = new discord_js_1.TextInputBuilder()
                            .setCustomId('username')
                            .setLabel('In-game Username')
                            .setStyle(discord_js_1.TextInputStyle.Short)
                            .setPlaceholder('Enter your in-game username')
                            .setRequired(true)
                            .setMaxLength(50);
                        notesInput = new discord_js_1.TextInputBuilder()
                            .setCustomId('notes')
                            .setLabel('Additional Notes (Optional)')
                            .setStyle(discord_js_1.TextInputStyle.Paragraph)
                            .setPlaceholder('Any additional information or preferences')
                            .setRequired(false)
                            .setMaxLength(500);
                        firstRow = new discord_js_1.ActionRowBuilder()
                            .addComponents(usernameInput);
                        secondRow = new discord_js_1.ActionRowBuilder()
                            .addComponents(notesInput);
                        modal.addComponents(firstRow, secondRow);
                        return [4 /*yield*/, interaction.showModal(modal)];
                    case 9:
                        _a.sent();
                        return [3 /*break*/, 12];
                    case 10:
                        error_6 = _a.sent();
                        console.error('❌ Error handling signup button:', error_6);
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ An error occurred. Please try again.',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleModalSubmit = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var eventId, username, notes, participantId, participantCount, error_7;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!interaction.customId.startsWith('signup_form_'))
                            return [2 /*return*/];
                        eventId = interaction.customId.replace('signup_form_', '');
                        username = interaction.fields.getTextInputValue('username');
                        notes = interaction.fields.getTextInputValue('notes') || null;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 12]);
                        if (!this.db) return [3 /*break*/, 5];
                        participantId = "participant_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        // Add participant to database
                        return [4 /*yield*/, this.db.run("\n          INSERT INTO match_participants (id, match_id, user_id, username)\n          VALUES (?, ?, ?, ?)\n        ", [participantId, eventId, interaction.user.id, username])];
                    case 2:
                        // Add participant to database
                        _b.sent();
                        return [4 /*yield*/, this.db.get("\n          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?\n        ", [eventId])];
                    case 3:
                        participantCount = _b.sent();
                        return [4 /*yield*/, interaction.reply({
                                content: "\u2705 Successfully signed up for the event!\n**Username:** ".concat(username, "\n**Participants:** ").concat((participantCount === null || participantCount === void 0 ? void 0 : participantCount.count) || 1),
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 4:
                        _b.sent();
                        console.log("\u2705 User ".concat(interaction.user.tag, " (").concat(username, ") signed up for event ").concat(eventId));
                        return [3 /*break*/, 6];
                    case 5: throw new Error('Database not available');
                    case 6: return [3 /*break*/, 12];
                    case 7:
                        error_7 = _b.sent();
                        console.error('❌ Error processing signup:', error_7);
                        if (!((_a = error_7.message) === null || _a === void 0 ? void 0 : _a.includes('UNIQUE constraint failed'))) return [3 /*break*/, 9];
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ You are already signed up for this event!',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, interaction.reply({
                            content: '❌ Failed to sign up. Please try again.',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        })];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11: return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, error_8;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 4, , 5]);
                        console.log('🚀 Starting MatchExec Discord Bot...');
                        // Initialize database
                        _a = this;
                        return [4 /*yield*/, (0, database_1.initializeDatabase)()];
                    case 1:
                        // Initialize database
                        _a.db = _d.sent();
                        console.log('✅ Database initialized');
                        // Load settings
                        _b = this;
                        return [4 /*yield*/, this.loadSettings()];
                    case 2:
                        // Load settings
                        _b.settings = _d.sent();
                        if (!((_c = this.settings) === null || _c === void 0 ? void 0 : _c.bot_token)) {
                            console.log('⚠️ No bot token configured. Please configure Discord settings in the web interface.');
                            console.log('🕐 Waiting for configuration...');
                            // Poll for settings every 30 seconds
                            this.pollForSettings();
                            return [2 /*return*/];
                        }
                        // Login to Discord
                        return [4 /*yield*/, this.client.login(this.settings.bot_token)];
                    case 3:
                        // Login to Discord
                        _d.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_8 = _d.sent();
                        console.error('❌ Failed to start Discord bot:', error_8);
                        process.exit(1);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.pollForSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var checkSettings;
            var _this = this;
            return __generator(this, function (_a) {
                checkSettings = function () { return __awaiter(_this, void 0, void 0, function () {
                    var _a, error_9;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = this;
                                return [4 /*yield*/, this.loadSettings()];
                            case 1:
                                _a.settings = _c.sent();
                                if (!(((_b = this.settings) === null || _b === void 0 ? void 0 : _b.bot_token) && !this.isReady)) return [3 /*break*/, 6];
                                console.log('✅ Bot token configured! Attempting to connect...');
                                _c.label = 2;
                            case 2:
                                _c.trys.push([2, 4, , 5]);
                                return [4 /*yield*/, this.client.login(this.settings.bot_token)];
                            case 3:
                                _c.sent();
                                return [3 /*break*/, 5];
                            case 4:
                                error_9 = _c.sent();
                                console.error('❌ Failed to login with bot token:', error_9);
                                setTimeout(checkSettings, 30000); // Try again in 30 seconds
                                return [3 /*break*/, 5];
                            case 5: return [3 /*break*/, 7];
                            case 6:
                                if (!this.isReady) {
                                    setTimeout(checkSettings, 30000); // Check again in 30 seconds
                                }
                                _c.label = 7;
                            case 7: return [2 /*return*/];
                        }
                    });
                }); };
                setTimeout(checkSettings, 30000); // Initial delay of 30 seconds
                return [2 /*return*/];
            });
        });
    };
    MatchExecBot.prototype.restart = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🔄 Restarting Discord bot...');
                        if (this.client.isReady()) {
                            this.client.destroy();
                        }
                        this.isReady = false;
                        return [4 /*yield*/, this.start()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                console.log('🛑 Stopping Discord bot...');
                if (this.client.isReady()) {
                    this.client.destroy();
                }
                this.isReady = false;
                return [2 /*return*/];
            });
        });
    };
    return MatchExecBot;
}());
exports.MatchExecBot = MatchExecBot;
// Create and start the bot
var bot = new MatchExecBot();
// Handle process signals
process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('🛑 Received SIGINT, shutting down gracefully...');
                return [4 /*yield*/, bot.stop()];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('🛑 Received SIGTERM, shutting down gracefully...');
                return [4 /*yield*/, bot.stop()];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
// Start the bot
bot.start().catch(console.error);
