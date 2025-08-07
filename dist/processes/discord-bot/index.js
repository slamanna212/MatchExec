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
exports.MatchExecBot = exports.deleteMatchDiscordAnnouncement = exports.getBotInstance = void 0;
var discord_js_1 = require("discord.js");
var fs_1 = require("fs");
var path_1 = require("path");
var database_1 = require("../../lib/database");
var signup_forms_1 = require("../../lib/signup-forms");
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
                        // Start announcement queue processor
                        this.startAnnouncementProcessor();
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
                        return [4 /*yield*/, this.db.get("\n        SELECT \n          bot_token,\n          guild_id,\n          announcement_channel_id,\n          results_channel_id,\n          participant_role_id,\n          event_duration_minutes\n        FROM discord_settings \n        WHERE id = 1\n      ")];
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
                                .setDescription('Check bot status and configuration')
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
                        _b.trys.push([1, 7, , 12]);
                        _a = commandName;
                        switch (_a) {
                            case 'status': return [3 /*break*/, 2];
                        }
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.handleStatusCommand(interaction)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, interaction.reply({
                            content: '❌ Unknown command.',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        })];
                    case 5:
                        _b.sent();
                        _b.label = 6;
                    case 6: return [3 /*break*/, 12];
                    case 7:
                        error_3 = _b.sent();
                        console.error('❌ Error handling slash command:', error_3);
                        errorMessage = '❌ An error occurred while processing your command.';
                        if (!(interaction.replied || interaction.deferred)) return [3 /*break*/, 9];
                        return [4 /*yield*/, interaction.followUp({ content: errorMessage, flags: discord_js_1.MessageFlags.Ephemeral })];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, interaction.reply({ content: errorMessage, flags: discord_js_1.MessageFlags.Ephemeral })];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11: return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
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
    MatchExecBot.prototype.postEventAnnouncement = function (eventData) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, embed, attachment, signupButton, row, announcementChannel, messageOptions, message, threadId, discordEventId, thread, rounds, messageRecordId, error_4, error_5;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!this.isReady || !((_b = this.settings) === null || _b === void 0 ? void 0 : _b.announcement_channel_id)) {
                            console.warn('⚠️ Bot not ready or announcement channel not configured');
                            return [2 /*return*/, false];
                        }
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 15, , 16]);
                        return [4 /*yield*/, this.createEventEmbedWithAttachment(eventData.name, eventData.description, eventData.game_id, eventData.type, eventData.maps || [], eventData.max_participants, eventData.livestream_link, eventData.event_image_url)];
                    case 2:
                        _a = _d.sent(), embed = _a.embed, attachment = _a.attachment;
                        signupButton = new discord_js_1.ButtonBuilder()
                            .setCustomId("signup_".concat(eventData.id))
                            .setLabel('🎮 Sign Up')
                            .setStyle(discord_js_1.ButtonStyle.Primary);
                        row = new discord_js_1.ActionRowBuilder()
                            .addComponents(signupButton);
                        return [4 /*yield*/, this.client.channels.fetch(this.settings.announcement_channel_id)];
                    case 3:
                        announcementChannel = _d.sent();
                        if (!((announcementChannel === null || announcementChannel === void 0 ? void 0 : announcementChannel.isTextBased()) && 'send' in announcementChannel)) return [3 /*break*/, 13];
                        messageOptions = {
                            embeds: [embed],
                            components: [row]
                        };
                        // Add attachment if image exists
                        if (attachment) {
                            messageOptions.files = [attachment];
                        }
                        return [4 /*yield*/, announcementChannel.send(messageOptions)];
                    case 4:
                        message = _d.sent();
                        threadId = null;
                        discordEventId = null;
                        if (!(eventData.maps && eventData.maps.length > 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.createMapsThread(message, eventData.name, eventData.game_id, eventData.maps)];
                    case 5:
                        thread = _d.sent();
                        threadId = (thread === null || thread === void 0 ? void 0 : thread.id) || null;
                        _d.label = 6;
                    case 6:
                        if (!eventData.start_date) return [3 /*break*/, 8];
                        rounds = ((_c = eventData.maps) === null || _c === void 0 ? void 0 : _c.length) || 1;
                        return [4 /*yield*/, this.createDiscordEvent(eventData, message, rounds)];
                    case 7:
                        discordEventId = _d.sent();
                        _d.label = 8;
                    case 8:
                        if (!this.db) return [3 /*break*/, 12];
                        _d.label = 9;
                    case 9:
                        _d.trys.push([9, 11, , 12]);
                        messageRecordId = "discord_msg_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        return [4 /*yield*/, this.db.run("\n              INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id)\n              VALUES (?, ?, ?, ?, ?, ?)\n            ", [messageRecordId, eventData.id, message.id, message.channelId, threadId, discordEventId])];
                    case 10:
                        _d.sent();
                        console.log("\u2705 Stored Discord message tracking for match: ".concat(eventData.id));
                        return [3 /*break*/, 12];
                    case 11:
                        error_4 = _d.sent();
                        console.error('❌ Error storing Discord message tracking:', error_4);
                        return [3 /*break*/, 12];
                    case 12:
                        console.log("\u2705 Event announcement posted for: ".concat(eventData.name));
                        return [2 /*return*/, true];
                    case 13:
                        console.error('❌ Could not find or access announcement channel');
                        return [2 /*return*/, false];
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        error_5 = _d.sent();
                        console.error('❌ Error posting event announcement:', error_5);
                        return [2 /*return*/, false];
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.createEventEmbedWithAttachment = function (name, description, gameId, type, maps, maxParticipants, livestreamLink, eventImageUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var gameName, gameColor, gameData, colorHex, error_6, embed, attachment, imagePath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        gameName = gameId;
                        gameColor = type === 'competitive' ? 0xff6b35 : 0x4caf50;
                        if (!this.db) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.db.get("\n          SELECT name, color FROM games WHERE id = ?\n        ", [gameId])];
                    case 2:
                        gameData = _a.sent();
                        console.log('Game data from database:', gameData);
                        if (gameData) {
                            gameName = gameData.name;
                            if (gameData.color) {
                                colorHex = gameData.color.replace('#', '');
                                gameColor = parseInt(colorHex, 16);
                                console.log("Using game color: ".concat(gameData.color, " -> ").concat(gameColor, " (0x").concat(colorHex, ")"));
                            }
                            else {
                                console.log('No color found for game, using fallback');
                            }
                        }
                        else {
                            console.log('No game data found for ID:', gameId);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_6 = _a.sent();
                        console.error('Error fetching game data:', error_6);
                        return [3 /*break*/, 4];
                    case 4:
                        embed = new discord_js_1.EmbedBuilder()
                            .setTitle(name)
                            .setDescription(description)
                            .setColor(gameColor)
                            .addFields({ name: '🎯 Game', value: gameName, inline: true }, { name: '🏆 Ruleset', value: type === 'competitive' ? '🥇 Competitive' : '🎮 Casual', inline: true })
                            .setTimestamp()
                            .setFooter({ text: 'MatchExec • Sign up to participate!' });
                        // Add maps count if provided (but not the actual maps - those go in thread)
                        if (maps.length > 0) {
                            embed.addFields({
                                name: '🗺️ Maps',
                                value: "".concat(maps.length, " map").concat(maps.length > 1 ? 's' : '', " selected - See thread for details"),
                                inline: false
                            });
                        }
                        // Add livestream link if provided
                        if (livestreamLink && livestreamLink.trim()) {
                            embed.addFields({
                                name: '📺 Livestream',
                                value: "[Watch Live](".concat(livestreamLink, ")"),
                                inline: true
                            });
                        }
                        // Add event image if provided - use as attachment like map images
                        if (eventImageUrl && eventImageUrl.trim()) {
                            try {
                                imagePath = path_1.default.join(process.cwd(), 'public', eventImageUrl.replace(/^\//, ''));
                                if (fs_1.default.existsSync(imagePath)) {
                                    // Create attachment for the event image
                                    attachment = new discord_js_1.AttachmentBuilder(imagePath, {
                                        name: "event_image.".concat(path_1.default.extname(imagePath).slice(1))
                                    });
                                    // Use attachment://filename to reference the attached image
                                    embed.setImage("attachment://event_image.".concat(path_1.default.extname(imagePath).slice(1)));
                                    console.log("\u2705 Added event image attachment: ".concat(eventImageUrl));
                                }
                                else {
                                    console.warn("\u26A0\uFE0F Event image not found: ".concat(imagePath));
                                }
                            }
                            catch (error) {
                                console.error("\u274C Error handling event image ".concat(eventImageUrl, ":"), error);
                            }
                        }
                        return [2 /*return*/, { embed: embed, attachment: attachment }];
                }
            });
        });
    };
    MatchExecBot.prototype.createDiscordEvent = function (eventData_1, message_1) {
        return __awaiter(this, arguments, void 0, function (eventData, message, rounds) {
            var guild, gameName, gameData, error_7, durationMinutes, startTime, endTime, eventDescription, eventOptions, imagePath, imageBuffer, discordEvent, error_8;
            var _a, _b, _c;
            if (rounds === void 0) { rounds = 1; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 6, , 7]);
                        guild = this.client.guilds.cache.get(((_a = this.settings) === null || _a === void 0 ? void 0 : _a.guild_id) || '');
                        if (!guild) {
                            console.warn('⚠️ Guild not found for Discord event creation');
                            return [2 /*return*/, null];
                        }
                        gameName = eventData.game_id;
                        if (!this.db) return [3 /*break*/, 4];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.db.get("\n            SELECT name FROM games WHERE id = ?\n          ", [eventData.game_id])];
                    case 2:
                        gameData = _d.sent();
                        if (gameData) {
                            gameName = gameData.name;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_7 = _d.sent();
                        console.error('Error fetching game name for Discord event:', error_7);
                        return [3 /*break*/, 4];
                    case 4:
                        durationMinutes = (((_b = this.settings) === null || _b === void 0 ? void 0 : _b.event_duration_minutes) || 45) * rounds;
                        startTime = new Date(eventData.start_date);
                        endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                        eventDescription = eventData.description || 'Join us for this exciting match!';
                        eventDescription += "\n\n\uD83C\uDFAF Game: ".concat(gameName);
                        eventDescription += "\n\uD83C\uDFC6 Type: ".concat(eventData.type === 'competitive' ? 'Competitive' : 'Casual');
                        if (eventData.livestream_link) {
                            eventDescription += "\n\uD83D\uDCFA Livestream: ".concat(eventData.livestream_link);
                        }
                        // Add link to the announcement message
                        eventDescription += "\n\n\uD83D\uDCE2 View full details: https://discord.com/channels/".concat(guild.id, "/").concat(message.channelId, "/").concat(message.id);
                        eventOptions = {
                            name: eventData.name,
                            description: eventDescription.substring(0, 1000), // Discord limit
                            scheduledStartTime: startTime,
                            scheduledEndTime: endTime,
                            privacyLevel: discord_js_1.GuildScheduledEventPrivacyLevel.GuildOnly,
                            entityType: discord_js_1.GuildScheduledEventEntityType.External,
                            entityMetadata: {
                                location: eventData.livestream_link || 'Discord Server'
                            }
                        };
                        // Add cover image if event image is provided
                        if (eventData.event_image_url) {
                            try {
                                imagePath = path_1.default.join(process.cwd(), 'public', eventData.event_image_url.replace(/^\//, ''));
                                if (fs_1.default.existsSync(imagePath)) {
                                    imageBuffer = fs_1.default.readFileSync(imagePath);
                                    eventOptions.image = imageBuffer;
                                    console.log("\u2705 Added cover image to Discord event: ".concat(eventData.event_image_url));
                                }
                                else {
                                    console.warn("\u26A0\uFE0F Event image not found for Discord event: ".concat(imagePath));
                                }
                            }
                            catch (error) {
                                console.error("\u274C Error adding cover image to Discord event:", error);
                            }
                        }
                        return [4 /*yield*/, guild.scheduledEvents.create(eventOptions)];
                    case 5:
                        discordEvent = _d.sent();
                        console.log("\u2705 Created Discord event: ".concat(discordEvent.name, " (ID: ").concat(discordEvent.id, ") - Duration: ").concat(durationMinutes, " minutes (").concat(rounds, " rounds \u00D7 ").concat(((_c = this.settings) === null || _c === void 0 ? void 0 : _c.event_duration_minutes) || 45, " min/round)"));
                        return [2 /*return*/, discordEvent.id];
                    case 6:
                        error_8 = _d.sent();
                        console.error('❌ Error creating Discord event:', error_8);
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.createMapsThread = function (message, eventName, gameId, maps) {
        return __awaiter(this, void 0, void 0, function () {
            var thread, i, mapIdentifier, mapNumber, mapEmbedData, messageOptions, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, message.startThread({
                                name: "".concat(eventName, " Maps"),
                                autoArchiveDuration: 1440, // 24 hours (in minutes)
                                type: discord_js_1.ChannelType.PublicThread,
                                reason: 'Map details for event'
                            })];
                    case 1:
                        thread = _a.sent();
                        console.log("\u2705 Created PUBLIC thread: ".concat(thread.name, " (ID: ").concat(thread.id, ") in channel ").concat(message.channelId));
                        i = 0;
                        _a.label = 2;
                    case 2:
                        if (!(i < maps.length)) return [3 /*break*/, 6];
                        mapIdentifier = maps[i];
                        mapNumber = i + 1;
                        return [4 /*yield*/, this.createMapEmbed(gameId, mapIdentifier, mapNumber)];
                    case 3:
                        mapEmbedData = _a.sent();
                        if (!mapEmbedData) return [3 /*break*/, 5];
                        messageOptions = { embeds: [mapEmbedData.embed] };
                        if (mapEmbedData.attachment) {
                            messageOptions.files = [mapEmbedData.attachment];
                        }
                        return [4 /*yield*/, thread.send(messageOptions)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        i++;
                        return [3 /*break*/, 2];
                    case 6:
                        console.log("\u2705 Created maps thread with ".concat(maps.length, " map embeds"));
                        return [2 /*return*/, thread];
                    case 7:
                        error_9 = _a.sent();
                        console.error('❌ Error creating maps thread:', error_9);
                        return [2 /*return*/, null];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.createMapEmbed = function (gameId, mapIdentifier, mapNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var mapData, title_1, modeName, modeData, error_10, gameColor, gameData, error_11, title, embed, imagePath, attachment, attachmentName, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db)
                            return [2 /*return*/, null];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 11, , 12]);
                        return [4 /*yield*/, this.db.get("\n        SELECT gm.name, gm.image_url, gm.location, gm.mode_id\n        FROM game_maps gm\n        WHERE gm.game_id = ? AND (gm.id = ? OR LOWER(gm.name) LIKE LOWER(?))\n        LIMIT 1\n      ", [gameId, mapIdentifier, "%".concat(mapIdentifier, "%")])];
                    case 2:
                        mapData = _a.sent();
                        if (!mapData) {
                            title_1 = mapNumber ? "Map ".concat(mapNumber, ": ").concat(mapIdentifier) : "\uD83D\uDDFA\uFE0F ".concat(mapIdentifier);
                            return [2 /*return*/, {
                                    embed: new discord_js_1.EmbedBuilder()
                                        .setTitle(title_1)
                                        .setDescription('Map details not available')
                                        .setColor(0x95a5a6)
                                }];
                        }
                        modeName = mapData.mode_id;
                        if (!this.db) return [3 /*break*/, 6];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.db.get("\n            SELECT name FROM game_modes WHERE id = ? AND game_id = ?\n          ", [mapData.mode_id, gameId])];
                    case 4:
                        modeData = _a.sent();
                        if (modeData) {
                            modeName = modeData.name;
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        error_10 = _a.sent();
                        console.error('Error fetching mode name:', error_10);
                        return [3 /*break*/, 6];
                    case 6:
                        gameColor = 0x95a5a6;
                        _a.label = 7;
                    case 7:
                        _a.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, this.db.get("\n          SELECT color FROM games WHERE id = ?\n        ", [gameId])];
                    case 8:
                        gameData = _a.sent();
                        if (gameData === null || gameData === void 0 ? void 0 : gameData.color) {
                            gameColor = parseInt(gameData.color.replace('#', ''), 16);
                        }
                        return [3 /*break*/, 10];
                    case 9:
                        error_11 = _a.sent();
                        console.error('Error fetching game color for map embed:', error_11);
                        return [3 /*break*/, 10];
                    case 10:
                        title = mapNumber ? "Map ".concat(mapNumber, ": ").concat(mapData.name) : "\uD83D\uDDFA\uFE0F ".concat(mapData.name);
                        embed = new discord_js_1.EmbedBuilder()
                            .setTitle(title)
                            .setColor(gameColor)
                            .addFields({ name: '🎮 Mode', value: modeName, inline: true });
                        if (mapData.location) {
                            embed.addFields({ name: '📍 Location', value: mapData.location, inline: true });
                        }
                        // Add image if available - use as attachment for local files
                        if (mapData.image_url) {
                            try {
                                imagePath = path_1.default.join(process.cwd(), 'public', mapData.image_url.replace(/^\//, ''));
                                if (fs_1.default.existsSync(imagePath)) {
                                    attachment = new discord_js_1.AttachmentBuilder(imagePath, {
                                        name: "".concat(mapData.name.replace(/[^a-zA-Z0-9]/g, '_'), ".").concat(path_1.default.extname(imagePath).slice(1))
                                    });
                                    attachmentName = "".concat(mapData.name.replace(/[^a-zA-Z0-9]/g, '_'), ".").concat(path_1.default.extname(imagePath).slice(1));
                                    embed.setImage("attachment://".concat(attachmentName));
                                    return [2 /*return*/, { embed: embed, attachment: attachment }];
                                }
                            }
                            catch (error) {
                                console.error("Error handling map image for ".concat(mapData.name, ":"), error);
                            }
                        }
                        return [2 /*return*/, { embed: embed }];
                    case 11:
                        error_12 = _a.sent();
                        console.error('Error creating map embed:', error_12);
                        return [2 /*return*/, null];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleButtonInteraction = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var eventId, existingParticipant, participantCount, eventData, signupForm, modal, rows, i, field, textInput, row, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!interaction.customId.startsWith('signup_'))
                            return [2 /*return*/];
                        eventId = interaction.customId.replace('signup_', '');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 14, , 16]);
                        if (!this.db) return [3 /*break*/, 13];
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
                        return [4 /*yield*/, this.db.get("\n          SELECT max_participants, game_id FROM matches WHERE id = ?\n        ", [eventId])];
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
                    case 8: return [4 /*yield*/, signup_forms_1.SignupFormLoader.loadSignupForm((eventData === null || eventData === void 0 ? void 0 : eventData.game_id) || '')];
                    case 9:
                        signupForm = _a.sent();
                        if (!!signupForm) return [3 /*break*/, 11];
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ Could not load signup form. Please try again.',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 10:
                        _a.sent();
                        return [2 /*return*/];
                    case 11:
                        modal = new discord_js_1.ModalBuilder()
                            .setCustomId("signup_form_".concat(eventId))
                            .setTitle('Event Sign Up');
                        rows = [];
                        for (i = 0; i < Math.min(signupForm.fields.length, 5); i++) { // Discord modal limit is 5 components
                            field = signupForm.fields[i];
                            textInput = new discord_js_1.TextInputBuilder()
                                .setCustomId(field.id)
                                .setLabel(field.label)
                                .setStyle(field.type === 'largetext' ? discord_js_1.TextInputStyle.Paragraph : discord_js_1.TextInputStyle.Short)
                                .setRequired(field.required)
                                .setMaxLength(field.type === 'largetext' ? 1000 : 100);
                            if (field.placeholder) {
                                textInput.setPlaceholder(field.placeholder);
                            }
                            row = new discord_js_1.ActionRowBuilder()
                                .addComponents(textInput);
                            rows.push(row);
                        }
                        modal.addComponents.apply(modal, rows);
                        return [4 /*yield*/, interaction.showModal(modal)];
                    case 12:
                        _a.sent();
                        _a.label = 13;
                    case 13: return [3 /*break*/, 16];
                    case 14:
                        error_13 = _a.sent();
                        console.error('❌ Error handling signup button:', error_13);
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ An error occurred. Please try again.',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 15:
                        _a.sent();
                        return [3 /*break*/, 16];
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.handleModalSubmit = function (interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var eventId, eventData, signupForm, signupData, displayUsername, _i, _a, field, value, participantId, participantCount, confirmationMessage, _b, _c, field, label, error_14;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!interaction.customId.startsWith('signup_form_'))
                            return [2 /*return*/];
                        eventId = interaction.customId.replace('signup_form_', '');
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 9, , 14]);
                        if (!this.db) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.db.get("\n          SELECT game_id FROM matches WHERE id = ?\n        ", [eventId])];
                    case 2:
                        eventData = _e.sent();
                        if (!eventData) {
                            throw new Error('Event not found');
                        }
                        return [4 /*yield*/, signup_forms_1.SignupFormLoader.loadSignupForm(eventData.game_id)];
                    case 3:
                        signupForm = _e.sent();
                        if (!signupForm) {
                            throw new Error('Could not load signup form');
                        }
                        signupData = {};
                        displayUsername = interaction.user.username;
                        for (_i = 0, _a = signupForm.fields; _i < _a.length; _i++) {
                            field = _a[_i];
                            try {
                                value = interaction.fields.getTextInputValue(field.id);
                                signupData[field.id] = value;
                                // Use the first field as the display username (usually username/battlenet_name)
                                if (field.id === 'username' || field.id === 'battlenet_name') {
                                    displayUsername = value;
                                }
                            }
                            catch (e) {
                                // Field might not exist in modal if we hit the 5-field limit
                                if (field.required) {
                                    throw new Error("Required field ".concat(field.id, " is missing"));
                                }
                            }
                        }
                        participantId = "participant_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        // Add participant to database with signup data
                        return [4 /*yield*/, this.db.run("\n          INSERT INTO match_participants (id, match_id, user_id, username, signup_data)\n          VALUES (?, ?, ?, ?, ?)\n        ", [participantId, eventId, interaction.user.id, displayUsername, JSON.stringify(signupData)])];
                    case 4:
                        // Add participant to database with signup data
                        _e.sent();
                        return [4 /*yield*/, this.db.get("\n          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?\n        ", [eventId])];
                    case 5:
                        participantCount = _e.sent();
                        confirmationMessage = "\u2705 Successfully signed up for the event!\n";
                        // Show key information from the signup form
                        for (_b = 0, _c = signupForm.fields.slice(0, 3); _b < _c.length; _b++) { // Show first 3 fields
                            field = _c[_b];
                            if (signupData[field.id]) {
                                label = field.label.replace(/\s*\(Optional\)\s*$/i, '');
                                confirmationMessage += "**".concat(label, ":** ").concat(signupData[field.id], "\n");
                            }
                        }
                        confirmationMessage += "**Participants:** ".concat((participantCount === null || participantCount === void 0 ? void 0 : participantCount.count) || 1);
                        return [4 /*yield*/, interaction.reply({
                                content: confirmationMessage,
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 6:
                        _e.sent();
                        console.log("\u2705 User ".concat(interaction.user.tag, " (").concat(displayUsername, ") signed up for event ").concat(eventId, ":"), signupData);
                        return [3 /*break*/, 8];
                    case 7: throw new Error('Database not available');
                    case 8: return [3 /*break*/, 14];
                    case 9:
                        error_14 = _e.sent();
                        console.error('❌ Error processing signup:', error_14);
                        if (!((_d = error_14.message) === null || _d === void 0 ? void 0 : _d.includes('UNIQUE constraint failed'))) return [3 /*break*/, 11];
                        return [4 /*yield*/, interaction.reply({
                                content: '❌ You are already signed up for this event!',
                                flags: discord_js_1.MessageFlags.Ephemeral
                            })];
                    case 10:
                        _e.sent();
                        return [3 /*break*/, 13];
                    case 11: return [4 /*yield*/, interaction.reply({
                            content: "\u274C Failed to sign up: ".concat(error_14.message, ". Please try again."),
                            flags: discord_js_1.MessageFlags.Ephemeral
                        })];
                    case 12:
                        _e.sent();
                        _e.label = 13;
                    case 13: return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.startAnnouncementProcessor = function () {
        var _this = this;
        // Process announcement queue every 10 seconds
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.processAnnouncementQueue()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 10000);
        // Process deletion queue every 10 seconds
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.processDeletionQueue()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 10000);
        // Clean up expired match messages every hour
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.cleanupExpiredMatches()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 3600000); // 1 hour
        console.log('✅ Announcement queue processor started');
        console.log('✅ Deletion queue processor started');
        console.log('✅ Expired match cleanup scheduler started');
    };
    MatchExecBot.prototype.processAnnouncementQueue = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pendingAnnouncements, _i, pendingAnnouncements_1, announcement, maps, success, error_15, error_16;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.db || !this.isReady || !((_a = this.settings) === null || _a === void 0 ? void 0 : _a.announcement_channel_id)) {
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 14, , 15]);
                        return [4 /*yield*/, this.db.all("\n        SELECT daq.*, m.name, m.description, m.game_id, m.max_participants, m.guild_id, m.maps, m.livestream_link, m.event_image_url, m.start_date, m.rules\n        FROM discord_announcement_queue daq\n        JOIN matches m ON daq.match_id = m.id\n        WHERE daq.status = 'pending'\n        ORDER BY daq.created_at ASC\n        LIMIT 5\n      ")];
                    case 2:
                        pendingAnnouncements = _b.sent();
                        _i = 0, pendingAnnouncements_1 = pendingAnnouncements;
                        _b.label = 3;
                    case 3:
                        if (!(_i < pendingAnnouncements_1.length)) return [3 /*break*/, 13];
                        announcement = pendingAnnouncements_1[_i];
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 10, , 12]);
                        maps = [];
                        if (announcement.maps) {
                            try {
                                maps = JSON.parse(announcement.maps);
                            }
                            catch (e) {
                                maps = [];
                            }
                        }
                        return [4 /*yield*/, this.postEventAnnouncement({
                                id: announcement.match_id,
                                name: announcement.name,
                                description: announcement.description || 'No description provided',
                                game_id: announcement.game_id,
                                type: announcement.rules || 'casual', // Use rules field from database
                                maps: maps,
                                max_participants: announcement.max_participants,
                                guild_id: announcement.guild_id,
                                livestream_link: announcement.livestream_link,
                                event_image_url: announcement.event_image_url,
                                start_date: announcement.start_date
                            })];
                    case 5:
                        success = _b.sent();
                        if (!success) return [3 /*break*/, 7];
                        // Mark as posted
                        return [4 /*yield*/, this.db.run("\n              UPDATE discord_announcement_queue \n              SET status = 'posted', posted_at = CURRENT_TIMESTAMP\n              WHERE id = ?\n            ", [announcement.id])];
                    case 6:
                        // Mark as posted
                        _b.sent();
                        console.log("\u2705 Posted announcement for: ".concat(announcement.name));
                        return [3 /*break*/, 9];
                    case 7: 
                    // Mark as failed
                    return [4 /*yield*/, this.db.run("\n              UPDATE discord_announcement_queue \n              SET status = 'failed', error_message = 'Failed to post announcement'\n              WHERE id = ?\n            ", [announcement.id])];
                    case 8:
                        // Mark as failed
                        _b.sent();
                        console.log("\u274C Failed to post announcement for: ".concat(announcement.name));
                        _b.label = 9;
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        error_15 = _b.sent();
                        console.error("\u274C Error processing announcement for ".concat(announcement.name, ":"), error_15);
                        // Mark as failed with error message
                        return [4 /*yield*/, this.db.run("\n            UPDATE discord_announcement_queue \n            SET status = 'failed', error_message = ?\n            WHERE id = ?\n          ", [error_15.message || 'Unknown error', announcement.id])];
                    case 11:
                        // Mark as failed with error message
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 3];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        error_16 = _b.sent();
                        console.error('❌ Error processing announcement queue:', error_16);
                        return [3 /*break*/, 15];
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.processDeletionQueue = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pendingDeletions, _i, pendingDeletions_1, deletion, success, error_17, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db || !this.isReady) {
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 14, , 15]);
                        return [4 /*yield*/, this.db.all("\n        SELECT * FROM discord_deletion_queue\n        WHERE status = 'pending'\n        ORDER BY created_at ASC\n        LIMIT 5\n      ")];
                    case 2:
                        pendingDeletions = _a.sent();
                        _i = 0, pendingDeletions_1 = pendingDeletions;
                        _a.label = 3;
                    case 3:
                        if (!(_i < pendingDeletions_1.length)) return [3 /*break*/, 13];
                        deletion = pendingDeletions_1[_i];
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 10, , 12]);
                        return [4 /*yield*/, this.deleteMatchAnnouncement(deletion.match_id)];
                    case 5:
                        success = _a.sent();
                        if (!success) return [3 /*break*/, 7];
                        // Mark as completed
                        return [4 /*yield*/, this.db.run("\n              UPDATE discord_deletion_queue \n              SET status = 'completed', processed_at = CURRENT_TIMESTAMP\n              WHERE id = ?\n            ", [deletion.id])];
                    case 6:
                        // Mark as completed
                        _a.sent();
                        console.log("\u2705 Processed deletion for match: ".concat(deletion.match_id));
                        return [3 /*break*/, 9];
                    case 7: 
                    // Mark as failed
                    return [4 /*yield*/, this.db.run("\n              UPDATE discord_deletion_queue \n              SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = 'Deletion failed'\n              WHERE id = ?\n            ", [deletion.id])];
                    case 8:
                        // Mark as failed
                        _a.sent();
                        console.log("\u274C Failed to delete messages for match: ".concat(deletion.match_id));
                        _a.label = 9;
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        error_17 = _a.sent();
                        console.error("\u274C Error processing deletion for match ".concat(deletion.match_id, ":"), error_17);
                        // Mark as failed with error message
                        return [4 /*yield*/, this.db.run("\n            UPDATE discord_deletion_queue \n            SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = ?\n            WHERE id = ?\n          ", [error_17.message || 'Unknown error', deletion.id])];
                    case 11:
                        // Mark as failed with error message
                        _a.sent();
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 3];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        error_18 = _a.sent();
                        console.error('❌ Error processing deletion queue:', error_18);
                        return [3 /*break*/, 15];
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.deleteMatchAnnouncement = function (matchId) {
        return __awaiter(this, void 0, void 0, function () {
            var matchData, messageRecords, _i, messageRecords_1, record, channel, message, error_19, guild, event_1, error_20, error_21, error_22;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.db || !this.isReady) {
                            console.warn('⚠️ Bot not ready or database not available for message deletion');
                            return [2 /*return*/, false];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 24, , 25]);
                        return [4 /*yield*/, this.db.get("\n        SELECT event_image_url FROM matches WHERE id = ?\n      ", [matchId])];
                    case 2:
                        matchData = _b.sent();
                        return [4 /*yield*/, this.db.all("\n        SELECT message_id, channel_id, thread_id, discord_event_id \n        FROM discord_match_messages \n        WHERE match_id = ?\n      ", [matchId])];
                    case 3:
                        messageRecords = _b.sent();
                        _i = 0, messageRecords_1 = messageRecords;
                        _b.label = 4;
                    case 4:
                        if (!(_i < messageRecords_1.length)) return [3 /*break*/, 20];
                        record = messageRecords_1[_i];
                        _b.label = 5;
                    case 5:
                        _b.trys.push([5, 18, , 19]);
                        return [4 /*yield*/, this.client.channels.fetch(record.channel_id)];
                    case 6:
                        channel = _b.sent();
                        if (!((channel === null || channel === void 0 ? void 0 : channel.isTextBased()) && 'messages' in channel)) return [3 /*break*/, 11];
                        _b.label = 7;
                    case 7:
                        _b.trys.push([7, 10, , 11]);
                        return [4 /*yield*/, channel.messages.fetch(record.message_id)];
                    case 8:
                        message = _b.sent();
                        return [4 /*yield*/, message.delete()];
                    case 9:
                        _b.sent();
                        console.log("\u2705 Deleted Discord message for match: ".concat(matchId));
                        return [3 /*break*/, 11];
                    case 10:
                        error_19 = _b.sent();
                        console.warn("\u26A0\uFE0F Could not delete message ".concat(record.message_id, ":"), error_19.message);
                        return [3 /*break*/, 11];
                    case 11:
                        if (!record.discord_event_id) return [3 /*break*/, 17];
                        _b.label = 12;
                    case 12:
                        _b.trys.push([12, 16, , 17]);
                        guild = this.client.guilds.cache.get(((_a = this.settings) === null || _a === void 0 ? void 0 : _a.guild_id) || '');
                        if (!guild) return [3 /*break*/, 15];
                        return [4 /*yield*/, guild.scheduledEvents.fetch(record.discord_event_id)];
                    case 13:
                        event_1 = _b.sent();
                        if (!event_1) return [3 /*break*/, 15];
                        return [4 /*yield*/, event_1.delete()];
                    case 14:
                        _b.sent();
                        console.log("\u2705 Deleted Discord event for match: ".concat(matchId));
                        _b.label = 15;
                    case 15: return [3 /*break*/, 17];
                    case 16:
                        error_20 = _b.sent();
                        console.warn("\u26A0\uFE0F Could not delete Discord event ".concat(record.discord_event_id, ":"), error_20.message);
                        return [3 /*break*/, 17];
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        error_21 = _b.sent();
                        console.error("\u274C Error deleting Discord message for match ".concat(matchId, ":"), error_21);
                        return [3 /*break*/, 19];
                    case 19:
                        _i++;
                        return [3 /*break*/, 4];
                    case 20:
                        if (!(matchData === null || matchData === void 0 ? void 0 : matchData.event_image_url)) return [3 /*break*/, 22];
                        return [4 /*yield*/, this.cleanupEventImage(matchData.event_image_url)];
                    case 21:
                        _b.sent();
                        _b.label = 22;
                    case 22: 
                    // Remove tracking records
                    return [4 /*yield*/, this.db.run("\n        DELETE FROM discord_match_messages WHERE match_id = ?\n      ", [matchId])];
                    case 23:
                        // Remove tracking records
                        _b.sent();
                        return [2 /*return*/, true];
                    case 24:
                        error_22 = _b.sent();
                        console.error('❌ Error in deleteMatchAnnouncement:', error_22);
                        return [2 /*return*/, false];
                    case 25: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.cleanupEventImage = function (imageUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_23;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fetch("".concat(process.env.PUBLIC_URL || 'http://localhost:3000', "/api/upload/event-image?imageUrl=").concat(encodeURIComponent(imageUrl)), {
                                method: 'DELETE',
                            })];
                    case 1:
                        response = _a.sent();
                        if (response.ok) {
                            console.log("\u2705 Cleaned up event image: ".concat(imageUrl));
                        }
                        else {
                            console.warn("\u26A0\uFE0F Failed to clean up event image: ".concat(imageUrl));
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_23 = _a.sent();
                        console.error("\u274C Error cleaning up event image ".concat(imageUrl, ":"), error_23);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.cleanupExpiredMatches = function () {
        return __awaiter(this, void 0, void 0, function () {
            var expiredMatches, _i, expiredMatches_1, match, error_24;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db || !this.isReady) {
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.db.all("\n        SELECT dmm.match_id, dmm.message_id, dmm.channel_id, dmm.thread_id, dmm.discord_event_id, m.event_image_url\n        FROM discord_match_messages dmm\n        JOIN matches m ON dmm.match_id = m.id\n        WHERE DATE(m.start_date) < DATE('now', '-1 day')\n      ")];
                    case 2:
                        expiredMatches = _a.sent();
                        console.log("\uD83E\uDDF9 Found ".concat(expiredMatches.length, " expired match announcements to clean up"));
                        _i = 0, expiredMatches_1 = expiredMatches;
                        _a.label = 3;
                    case 3:
                        if (!(_i < expiredMatches_1.length)) return [3 /*break*/, 6];
                        match = expiredMatches_1[_i];
                        return [4 /*yield*/, this.deleteMatchAnnouncement(match.match_id)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        if (expiredMatches.length > 0) {
                            console.log("\u2705 Cleaned up ".concat(expiredMatches.length, " expired match announcements"));
                        }
                        return [3 /*break*/, 8];
                    case 7:
                        error_24 = _a.sent();
                        console.error('❌ Error cleaning up expired matches:', error_24);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecBot.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, error_25;
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
                        error_25 = _d.sent();
                        console.error('❌ Failed to start Discord bot:', error_25);
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
                    var _a, error_26;
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
                                error_26 = _c.sent();
                                console.error('❌ Failed to login with bot token:', error_26);
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
// Export bot instance for use by other processes
var getBotInstance = function () { return bot; };
exports.getBotInstance = getBotInstance;
// Export method for deleting match announcements
var deleteMatchDiscordAnnouncement = function (matchId) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, bot.deleteMatchAnnouncement(matchId)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.deleteMatchDiscordAnnouncement = deleteMatchDiscordAnnouncement;
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
