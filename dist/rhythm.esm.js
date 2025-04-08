function pinpoint(coordinate, current_time) {
    return (coordinate !== undefined &&
        coordinate !== 0) ? coordinate : current_time;
}
class Play {
    path;
    constructor(path) {
        this.path = path;
    }
    async compile(output_node) {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();
        const context = output_node.context;
        const audio_buffer = await context.decodeAudioData(array_buffer);
        return new CompiledPlay(output_node, audio_buffer);
    }
}
class CompiledPlay {
    output_node;
    buffer;
    duration;
    constructor(output_node, buffer) {
        this.output_node = output_node;
        this.buffer = buffer;
        this.duration = buffer.duration;
    }
    schedule_play(play_at, maybe_offset) {
        const output_node = this.output_node;
        const context = output_node.context;
        const player = context.createBufferSource();
        player.buffer = this.buffer;
        player.onended = (_) => {
            player.disconnect();
        };
        player.connect(this.output_node);
        const start_time = pinpoint(play_at, context.currentTime);
        player.start(start_time, maybe_offset);
        return {
            schedule_stop: (stop_at) => {
                player.stop(stop_at);
            },
            time_from_start: () => {
                return (context.currentTime - start_time);
            }
        };
    }
    async compile(output_node) {
        if (this.output_node === output_node) {
            return this;
        }
        return new CompiledPlay(output_node, this.buffer);
    }
}
class Clip {
    to_clip;
    duration;
    offset;
    constructor(to_clip, duration, offset = 0) {
        this.to_clip = to_clip;
        this.duration = duration;
        this.offset = offset;
    }
    async compile(output_node) {
        return new CompiledClip(await this.to_clip.compile(output_node), this.duration, this.offset);
    }
}
class CompiledClip {
    to_clip;
    duration;
    offset;
    constructor(to_clip, duration, offset = 0) {
        this.to_clip = to_clip;
        this.duration = duration;
        this.offset = offset;
    }
    get output_node() {
        return this.to_clip.output_node;
    }
    schedule_play(play_at, maybe_offset) {
        const start_time = pinpoint(play_at, this.output_node.context.currentTime);
        const offset = maybe_offset ?? 0;
        const command = this.to_clip;
        const scheduled = command.schedule_play(start_time, (this.offset + offset));
        scheduled.schedule_stop((start_time + (this.duration - offset)));
        return scheduled;
    }
    async compile(output_node) {
        if (this.output_node === output_node) {
            return this;
        }
        return new CompiledClip(await this.to_clip.compile(output_node), this.duration, this.offset);
    }
}
class Repeat {
    to_repeat;
    duration;
    constructor(to_repeat, duration) {
        this.to_repeat = to_repeat;
        this.duration = duration;
    }
    async compile(output_node) {
        return new CompiledRepeat(await this.to_repeat.compile(output_node), this.duration);
    }
}
class CompiledRepeat {
    to_repeat;
    duration;
    constructor(to_repeat, duration) {
        this.to_repeat = to_repeat;
        this.duration = duration;
    }
    get output_node() {
        return this.to_repeat.output_node;
    }
    schedule_play(play_at, maybe_offset) {
        const offset = maybe_offset ?? 0;
        const command = this.to_repeat;
        const command_duration = command.duration;
        const duration = this.duration;
        const context = this.output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);
        let remaining_duration = (duration - offset);
        let repeat_offset = (offset % command_duration);
        let til_next_repeat = start_time;
        const repeats = [];
        while (remaining_duration > 0) {
            repeats.push(command.schedule_play(til_next_repeat, repeat_offset));
            const repeat_duration = command_duration - repeat_offset;
            til_next_repeat = (til_next_repeat + repeat_duration);
            remaining_duration = (remaining_duration - repeat_duration);
            repeat_offset = 0;
        }
        const last_scheduled = repeats.at(-1);
        last_scheduled?.schedule_stop(start_time + (duration - offset));
        return {
            schedule_stop: (stop_at) => {
                for (const scheduled of repeats) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time);
            },
        };
    }
    async compile(output_node) {
        if (this.output_node === output_node) {
            return this;
        }
        return new CompiledRepeat(await this.to_repeat.compile(output_node), this.duration);
    }
}
class Sequence {
    sequence;
    constructor(sequence) {
        this.sequence = sequence;
    }
    async compile(output_node) {
        return new CompiledSequence(output_node, await Promise.all(this.sequence.map((compilable) => compilable.compile(output_node))));
    }
}
class CompiledSequence {
    output_node;
    sequence;
    duration;
    constructor(output_node, sequence) {
        this.output_node = output_node;
        this.sequence = sequence;
        this.duration = sequence
            .map((command) => command.duration)
            .reduce((total_duration, duration) => total_duration + duration, 0);
    }
    schedule_play(play_at, maybe_offset) {
        const context = this.output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);
        let offset = (maybe_offset ?? 0);
        const iterator = this.sequence.values();
        let next_start_time = 0;
        const sequenced = [];
        while (true) {
            const { value: command, done } = iterator.next();
            if (done) {
                break;
            }
            const command_duration = command.duration;
            if (offset < command_duration) {
                sequenced.push(command.schedule_play(start_time, offset));
                next_start_time = (start_time + (command_duration - offset));
                break;
            }
            offset = (offset - command_duration);
        }
        while (true) {
            const { value: command, done } = iterator.next();
            if (done) {
                break;
            }
            sequenced.push(command.schedule_play(next_start_time));
            next_start_time = (next_start_time + command.duration);
        }
        return {
            schedule_stop: (stop_at) => {
                for (const scheduled of sequenced) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time);
            },
        };
    }
    async compile(output_node) {
        if (this.output_node === output_node) {
            return this;
        }
        return new CompiledSequence(this.output_node, await Promise.all(this.sequence.map((command) => command.compile(output_node))));
    }
}
class Gain {
    to_gain;
    gain_commands;
    constructor(to_gain, gain_commands) {
        this.to_gain = to_gain;
        this.gain_commands = gain_commands;
    }
    async compile(output_node) {
        const gain_node = output_node.context.createGain();
        return new CompiledGain(gain_node, output_node, await this.to_gain.compile(gain_node), this.gain_commands);
    }
}
class CompiledGain {
    gain_node;
    output_node;
    to_gain;
    gain_commands;
    get duration() {
        return this.to_gain.duration;
    }
    constructor(gain_node, output_node, to_gain, gain_commands) {
        this.gain_node = gain_node;
        this.output_node = output_node;
        this.to_gain = to_gain;
        this.gain_commands = gain_commands;
        gain_node.connect(output_node);
    }
    schedule_play(play_at, maybe_offset) {
        const context = this.output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);
        const offset = maybe_offset ?? 0;
        const scheduled = this.to_gain.schedule_play(start_time, offset);
        const gain = this.gain_node.gain;
        const original_value = gain.value;
        for (const { transition, value, when_from_start } of this.gain_commands) {
            const value_changer = (() => {
                switch (transition) {
                    case undefined: {
                        return (value, start_time) => gain.setValueAtTime(value, start_time);
                    }
                    case "exponential": {
                        return (value, start_time) => gain.exponentialRampToValueAtTime(value, start_time);
                    }
                    case "linear": {
                        return (value, start_time) => gain.linearRampToValueAtTime(value, start_time);
                    }
                }
            })();
            value_changer(value, Math.max(0, (start_time + when_from_start) - offset));
        }
        return {
            schedule_stop: (stop_at) => {
                const stop_time = pinpoint(stop_at, context.currentTime);
                scheduled.schedule_stop(stop_at);
                gain.cancelScheduledValues(stop_time);
                gain.setValueAtTime(original_value, stop_time);
            },
            time_from_start: () => {
                return scheduled.time_from_start();
            },
        };
    }
    async compile(other_output_node) {
        if (this.output_node === other_output_node) {
            return this;
        }
        const gain_node = other_output_node.context.createGain();
        gain_node.connect(other_output_node);
        return new CompiledGain(gain_node, other_output_node, await this.to_gain.compile(gain_node), this.gain_commands);
    }
}
class RhythmContext {
    context;
    constructor(context) {
        this.context = context ?? new AudioContext();
    }
    compile(command) {
        return command.compile(this.context.destination);
    }
    get current_time() {
        return this.context.currentTime;
    }
}

export { Clip, CompiledClip, CompiledGain, CompiledPlay, CompiledRepeat, CompiledSequence, Gain, Play, Repeat, RhythmContext, Sequence };
