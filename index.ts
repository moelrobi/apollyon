import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnection } from "@discordjs/voice";
import { Client, CommandInteraction, GuildMember, Intents, MessageEmbed, Snowflake } from "discord.js";
import { v4 as uuidv4 } from 'uuid';
import * as ytdl from "youtube-dl-exec";
import * as config from "./config.json";
import glob from "glob-promise";
import { unlinkSync } from "fs";

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES]})

class Song {
    link: string
    name: string
    author: string
    thumbnail: string
    duration: number

    constructor(link: string) {
        this.link = link
        this.thumbnail = "https://i.uwu.tools/VOxE5/YEXUVIpi26.gif/raw.gif"
        this.name = "No-Name :("
        this.duration = 0
        this.author = "No-Name :("

        ytdl.default(link, {
            dumpSingleJson: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            noPlaylist: true
        }).then(info => {
            this.name = info.title,
            this.author = info.uploader
            this.thumbnail = info.thumbnail
            this.duration = info.duration
        })
    }
}

class GuildQueue {
    guild_id: Snowflake
    voice_channel: Snowflake
    current_song: Song
    current_connection: VoiceConnection
    current_player: AudioPlayer
    queue: Array<Song> = []
    interaction: CommandInteraction

    constructor (GuildId: Snowflake, VoiceChannel: Snowflake, NewSong: Song, NewConnection: VoiceConnection, NewPlayer: AudioPlayer, cmdInt: CommandInteraction) {
        this.guild_id = GuildId
        this.current_song = NewSong
        this.voice_channel = VoiceChannel
        this.current_connection = NewConnection
        this.current_player = NewPlayer
        this.interaction = cmdInt

        this.current_connection.subscribe(this.current_player)
    }

    /**
     * play_song
     * This function is used to play a youtube video in different guilds.
     */
    public play_song() {
        const fileName = uuidv4();

        const process = ytdl.raw(this.current_song.link, {
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            noPlaylist: true,
            format: 'bestaudio',
            output: `./v/${fileName}.%(ext)s`
        })

        process.on('exit', () => {
            glob(`${fileName}.*`, {cwd: './v/'}).then(async files => {
                const res = createAudioResource(`./v/${files[0]}`)
                this.current_player.play(res)

                let embed = new MessageEmbed

                embed
                    .setTitle(`Spiele jetzt: ${this.current_song.name}`)
                    .setURL(this.current_song.link)
                    .setImage(this.current_song.thumbnail)
                    .setDescription(`Das Lied ist von: ${this.current_song.author}`)

                this.interaction.editReply({embeds: [embed]})

                this.current_player.on(AudioPlayerStatus.Idle, () => {
                    setTimeout(() => unlinkSync('./v/' + files[0]), 5_000)

                    const current = this.queue.pop()

                    if (!current) {
                        this.current_connection.destroy()
                        current_servers = current_servers.filter(guildqueue => guildqueue.guild_id != this.guild_id)
                        this.interaction.editReply({content: 'Alles klar! Wir sind hier fertig!', embeds: []})

                        console.log(current_servers)
                        
                        return;
                    }

                    this.current_song = current
                    this.play_song()
                })
            });
        })
    }

    /**
     * skip_song
     */
    public skip_song() {
        this.current_player.stop()
    }

    /**
     * pause_song
     */
    public pause_song() {
        this.current_player.pause()
    }

    /**
     * resume_song
     */
    public resume_song() {
        this.current_player.unpause();
    }

    /**
     * delete_and_destroy
     */
    public delete_and_destroy() {
        this.queue = [];
        this.current_player.stop();
    }
}

let current_servers: Array<GuildQueue> = []

client.on('ready', () => {
    client.user?.setActivity({name: "mit /play"})

    console.log(`${client.user?.tag} is nun online!`)
})

client.on('messageCreate', async message => {
    //TODO: implement the Creation of all Commands.

    if(!client.application?.owner) await client.application?.fetch();
    if(message.content == "love you apoo.." && message.author.id === client.application?.owner?.id) {
        client.guilds.cache.get('843546082897952848')?.commands.create({
            name: "queue",
            description: "Zeigt dir die Queue an.",
        })

        message.delete()
    }
})

client.on('interactionCreate', async interaction => {
    if( interaction.isCommand() && interaction.commandName === 'play' ) {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)
        const link = interaction.options.getString("link")
        const member = interaction.member as GuildMember;
        const voice = member.voice;

        if(!link) {
            interaction.reply({content: 'Du hast keinen Link eingegeben.', ephemeral: true})
            return;
        }

        if(!found) {
            if(voice.channelId == null) {
                return;
            }

            interaction.deferReply();

            let obj = new GuildQueue(
                voice.guild.id,
                voice.channelId,
                new Song(link),
                joinVoiceChannel({
                    channelId: voice.channelId,
                    guildId: voice.guild.id,
                    adapterCreator: voice.guild.voiceAdapterCreator
                }),
                createAudioPlayer(),
                interaction
            )

            current_servers.push(obj);

            obj.play_song();

            return;
        }

        found.queue.push(new Song(link))
        interaction.reply({content: 'Added to queue!', ephemeral: true})
    }

    if(interaction.isCommand() && interaction.commandName === 'skip') {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)

        if(!found) {
            interaction.reply({content: 'Aber wir hören doch gar keine Musik? <:axoconfused:773574445629440010>', ephemeral: true})
            return;
        }

        interaction.reply({content: 'Skipped! :)'})
        found.skip_song();
        setTimeout(() => interaction.deleteReply(), 10_000)
    }

    if(interaction.isCommand() && interaction.commandName === 'pause') {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)

        if(!found) {
            interaction.reply({content: 'Aber wir hören doch gar keine Musik? <:axoconfused:773574445629440010>', ephemeral: true})
            return;
        }

        interaction.reply({content: 'Paused! :)'})
        found.pause_song();
        setTimeout(() => interaction.deleteReply(), 10_000)
    }

    if(interaction.isCommand() && interaction.commandName === 'resume') {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)

        if(!found) {
            interaction.reply({content: 'Aber wir hören doch gar keine Musik? <:axoconfused:773574445629440010>', ephemeral: true})
            return;
        }

        interaction.reply({content: 'Resumed! :)'})
        found.resume_song();
        setTimeout(() => interaction.deleteReply(), 10_000)
    }

    if(interaction.isCommand() && (interaction.commandName === "disconnect" || interaction.commandName === "fuckoff")) {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)

        if(!found) {
            interaction.reply({content: 'Aber wir hören doch gar keine Musik? <:axoconfused:773574445629440010>', ephemeral: true})
            return;
        }

        interaction.reply({content: 'Cleared and destroyed! :)'})
        found.delete_and_destroy();
        setTimeout(() => interaction.deleteReply(), 10_000)
    }

    if(interaction.isCommand() && interaction.commandName === "queue") {
        const found = current_servers.find(element => element.guild_id == interaction.guildId)

        if(!found) {
            interaction.reply({content: 'Aber wir hören doch gar keine Musik? <:axoconfused:773574445629440010>', ephemeral: true})
            return;
        }

        let embed = new MessageEmbed

        embed.setTitle("Queue")
            .setDescription("Diese Lieder sind noch in der Warteschlange.")
            .addField(`**Current**: ${found.current_song.name}`, `by: ${found.current_song.author} - (${Math.floor(found.current_song.duration / 60)}:${Math.floor(found.current_song.duration % 60)})`)

        if(found.queue.length > 5) {
            for (let i = 0; i < 5; i++) {
                const element = found.queue[i];
                embed.addField(element.name, `by: ${element.author} - (${Math.floor(element.duration / 60)}:${Math.floor(element.duration % 60)})`)
            }

            embed.addField("Und noch weitere...", "Leider kann ich dir das noch nicht zeigen :(")
        } else {
            found.queue.forEach(element => {
                embed.addField(element.name, `by: ${element.author} - (${Math.floor(element.duration / 60)}:${Math.floor(element.duration % 60)})`)
            });
        }

        interaction.reply({embeds: [embed], ephemeral: true})
    }
})

client.login(config.token);