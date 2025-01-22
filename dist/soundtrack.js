(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Soundtrack = {}));
})(this, (function (exports) { 'use strict';

    class Play {
        path;
        constructor(path) {
            this.path = path;
        }
        async compile(context, output_node) {
            const response = await fetch(this.path);
            const array_buffer = await response.arrayBuffer();
            const audio_buffer = await context.decodeAudioData(array_buffer);
            return new CompiledPlay(context, output_node, audio_buffer);
        }
    }
    class CompiledPlay {
        context;
        output_node;
        players;
        buffer;
        duration;
        constructor(context, output_node, buffer) {
            this.context = context;
            this.output_node = output_node;
            this.buffer = buffer;
            this.duration = buffer.duration;
            this.players = new Set();
        }
        play(maybe_wait, maybe_offset) {
            const player = this.context.createBufferSource();
            const players = this.players;
            players.add(player);
            player.buffer = this.buffer;
            player.onended = (_) => {
                player.disconnect();
                players.delete(player);
            };
            player.connect(this.output_node);
            player.start(this.context.currentTime + (maybe_wait ?? 0), maybe_offset);
        }
        stop(maybe_wait) {
            const wait = this.context.currentTime + (maybe_wait ?? 0);
            for (const player of this.players) {
                player.stop(wait);
            }
        }
        async compile(context, output_node) {
            if (this.context === context && this.output_node === output_node) {
                return this;
            }
            return new CompiledPlay(context, output_node, this.buffer);
        }
    }
    class Clip {
        to_clip;
        offset;
        duration;
        constructor(to_clip, offset, duration) {
            this.to_clip = to_clip;
            this.offset = offset;
            this.duration = duration;
        }
        async compile(context, output_node) {
            return new CompiledClip(await this.to_clip.compile(context, output_node), this.offset, this.duration);
        }
    }
    class CompiledClip {
        command;
        offset;
        duration;
        constructor(command, offset, duration) {
            this.command = command;
            this.offset = offset;
            this.duration = duration;
        }
        get context() {
            return this.command.context;
        }
        get output_node() {
            return this.command.output_node;
        }
        play(maybe_wait, maybe_offset) {
            const wait = maybe_wait ?? 0;
            const offset = maybe_offset ?? 0;
            const command = this.command;
            command.play(wait, (this.offset + offset));
            command.stop((wait + (this.duration - offset)));
        }
        stop(maybe_wait) {
            this.command.stop(maybe_wait);
        }
        async compile(context, output_node) {
            if (this.context === context && this.output_node === output_node) {
                return this;
            }
            return new CompiledClip(await this.command.compile(context, output_node), this.offset, this.duration);
        }
    }
    class Repeat {
        to_repeat;
        duration;
        constructor(to_repeat, duration) {
            this.to_repeat = to_repeat;
            this.duration = duration;
        }
        async compile(context, output_node) {
            return new CompiledRepeat(await this.to_repeat.compile(context, output_node), this.duration);
        }
    }
    class CompiledRepeat {
        command;
        duration;
        constructor(command, duration) {
            this.command = command;
            this.duration = duration;
        }
        get context() {
            return this.command.context;
        }
        get output_node() {
            return this.command.output_node;
        }
        play(maybe_wait, maybe_offset) {
            const wait = maybe_wait ?? 0;
            const offset = maybe_offset ?? 0;
            const command = this.command;
            const command_duration = command.duration;
            const duration = this.duration;
            let remaining_duration = (duration - offset);
            let repeat_offset = (offset % command_duration);
            let start_time = wait;
            while (remaining_duration > 0) {
                command.play(start_time, repeat_offset);
                const repeat_duration = command_duration - repeat_offset;
                start_time = (start_time + repeat_duration);
                remaining_duration = (remaining_duration - repeat_duration);
                repeat_offset = 0;
            }
            this.stop(wait + (duration - offset));
        }
        stop(maybe_wait) {
            this.command.stop(maybe_wait);
        }
        async compile(context, output_node) {
            if (this.context === context && this.output_node === output_node) {
                return this;
            }
            return new CompiledRepeat(await this.command.compile(context, output_node), this.duration);
        }
    }
    class Sequence {
        sequence;
        constructor(sequence) {
            this.sequence = sequence;
        }
        async compile(context, output_node) {
            return new CompiledSequence(context, output_node, await Promise.all(this.sequence.map((compilable) => compilable.compile(context, output_node))));
        }
    }
    class CompiledSequence {
        commands;
        duration;
        context;
        output_node;
        constructor(context, output_node, commands) {
            this.context = context;
            this.output_node = output_node;
            this.commands = commands;
            this.duration = commands
                .map((command) => command.duration)
                .reduce((total_duration, duration) => total_duration + duration, 0);
        }
        play(maybe_wait, maybe_offset) {
            let wait = maybe_wait ?? 0;
            let offset = (maybe_offset ?? 0);
            const iterator = this.commands.values();
            let next_start_time = 0;
            while (true) {
                const { value: command, done } = iterator.next();
                if (done) {
                    break;
                }
                const command_duration = command.duration;
                if (offset < command_duration) {
                    command.play(wait, offset);
                    next_start_time = (wait +
                        (command_duration - offset));
                    break;
                }
                offset = (offset - command_duration);
            }
            while (true) {
                const { value: command, done } = iterator.next();
                if (done) {
                    break;
                }
                command.play(next_start_time);
                next_start_time = (next_start_time + command.duration);
            }
        }
        stop(maybe_wait) {
            for (const command of this.commands) {
                command.stop(maybe_wait);
            }
        }
        async compile(context, output_node) {
            if (this.context === context && this.output_node === output_node) {
                return this;
            }
            return new CompiledSequence(this.context, this.output_node, await Promise.all(this.commands.map((command) => command.compile(context, output_node))));
        }
    }
    class Gain {
        command;
        gain_commands;
        constructor(command, gain_commands) {
            this.command = command;
            this.gain_commands = gain_commands;
        }
        async compile(context, output_node) {
            const gain_node = context.createGain();
            gain_node.connect(output_node);
            return new CompiledGain(gain_node, output_node, await this.command.compile(context, gain_node), this.gain_commands);
        }
    }
    class CompiledGain {
        gain_node;
        to_gain;
        gain_commands;
        output_node;
        get duration() {
            return this.to_gain.duration;
        }
        get context() {
            return this.to_gain.context;
        }
        constructor(gain_node, output_node, to_gain, gain_commands) {
            this.gain_node = gain_node;
            this.to_gain = to_gain;
            this.output_node = output_node;
            this.gain_commands = gain_commands;
        }
        play(maybe_wait, maybe_offset) {
            const wait = maybe_wait ?? 0;
            const offset = maybe_offset ?? 0;
            this.to_gain.play(wait, offset);
            const gain = this.gain_node.gain;
            for (const { transition, value, when } of this.gain_commands) {
                const value_changer = (() => {
                    switch (transition) {
                        case undefined: {
                            return gain.setValueAtTime;
                        }
                        case "exponential": {
                            return gain.exponentialRampToValueAtTime;
                        }
                        case "linear": {
                            return gain.linearRampToValueAtTime;
                        }
                    }
                })();
                value_changer(value, Math.max(0, ((wait ?? 0) + when) - offset));
            }
        }
        stop(maybe_wait) {
            this.to_gain.stop(maybe_wait);
        }
        async compile(context, output_node) {
            if (this.context === context && this.output_node === output_node) {
                return this;
            }
            const gain_node = context.createGain();
            gain_node.connect(output_node);
            return new CompiledGain(gain_node, output_node, await this.to_gain.compile(context, gain_node), this.gain_commands);
        }
    }
    class Player {
        context;
        constructor(context) {
            this.context = context ?? new AudioContext();
        }
        load(command) {
            const context = this.context;
            return command.compile(context, context.destination);
        }
    }

    exports.Clip = Clip;
    exports.CompiledClip = CompiledClip;
    exports.CompiledGain = CompiledGain;
    exports.CompiledPlay = CompiledPlay;
    exports.CompiledRepeat = CompiledRepeat;
    exports.CompiledSequence = CompiledSequence;
    exports.Gain = Gain;
    exports.Play = Play;
    exports.Player = Player;
    exports.Repeat = Repeat;
    exports.Sequence = Sequence;

}));
