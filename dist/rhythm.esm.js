function pinpoint(coordinate, current_time) {
    return (coordinate !== undefined &&
        coordinate !== 0) ? coordinate : current_time;
}
class Play {
    path;
    constructor(path) {
        this.path = path;
    }
    async compile(context) {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();
        const audio_buffer = await context.decodeAudioData(array_buffer);
        return new CompiledPlay(audio_buffer);
    }
}
class CompiledPlay {
    buffer;
    duration;
    constructor(buffer) {
        this.buffer = buffer;
        this.duration = buffer.duration;
    }
    schedule_play(output_node, play_at, maybe_offset) {
        const context = output_node.context;
        const player = context.createBufferSource();
        player.buffer = this.buffer;
        const on_stop_listeners = [
            (_) => player.disconnect()
        ];
        player.onended = (event) => {
            let listener = undefined;
            while ((listener = on_stop_listeners.pop()) !== undefined) {
                listener(event);
            }
        };
        player.connect(output_node);
        const start_time = pinpoint(play_at, context.currentTime);
        player.start(start_time, maybe_offset);
        return {
            schedule_stop: (stop_at) => {
                player.stop(stop_at);
            },
            time_from_start: () => {
                return (context.currentTime - start_time);
            },
            add_on_stop_listener: (listener) => on_stop_listeners.push(listener)
        };
    }
    async compile(_) {
        return this;
    }
    attach_to(output_node) {
        return new Attached(this, output_node);
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
    async compile(context) {
        return new CompiledClip(await this.to_clip.compile(context), this.duration, this.offset);
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
    schedule_play(output_node, play_at, maybe_offset) {
        const start_time = pinpoint(play_at, output_node.context.currentTime);
        const offset = maybe_offset ?? 0;
        const command = this.to_clip;
        const scheduled = command.schedule_play(output_node, start_time, (this.offset + offset));
        scheduled.schedule_stop((start_time + (this.duration - offset)));
        return scheduled;
    }
    async compile(_) {
        return this;
    }
    attach_to(output_node) {
        return new Attached(this, output_node);
    }
}
class Repeat {
    to_repeat;
    duration;
    constructor(to_repeat, duration) {
        this.to_repeat = to_repeat;
        this.duration = duration;
    }
    async compile(context) {
        return new CompiledRepeat(await this.to_repeat.compile(context), this.duration);
    }
}
class CompiledRepeat {
    to_repeat;
    duration;
    constructor(to_repeat, duration) {
        this.to_repeat = to_repeat;
        this.duration = duration;
    }
    schedule_play(output_node, play_at, maybe_offset) {
        const offset = maybe_offset ?? 0;
        const command = this.to_repeat;
        const command_duration = command.duration;
        const duration = this.duration;
        const context = output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);
        let remaining_duration = (duration - offset);
        let repeat_offset = (offset % command_duration);
        let til_next_repeat = start_time;
        const repeats = [];
        while (remaining_duration > 0) {
            repeats.push(command.schedule_play(output_node, til_next_repeat, repeat_offset));
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
            add_on_stop_listener: (listener) => {
                last_scheduled?.add_on_stop_listener(listener);
            }
        };
    }
    async compile(_) {
        return this;
    }
    attach_to(output_node) {
        return new Attached(this, output_node);
    }
}
class Sequence {
    sequence;
    constructor(sequence) {
        this.sequence = sequence;
    }
    async compile(context) {
        return new CompiledSequence(await Promise.all(this.sequence.map((compilable) => compilable.compile(context))));
    }
}
class CompiledSequence {
    sequence;
    duration;
    constructor(sequence) {
        this.sequence = sequence;
        this.duration = sequence
            .map((command) => command.duration)
            .reduce((total_duration, duration) => total_duration + duration, 0);
    }
    schedule_play(output_node, play_at, maybe_offset) {
        const context = output_node.context;
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
                sequenced.push(command.schedule_play(output_node, start_time, offset));
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
            sequenced.push(command.schedule_play(output_node, next_start_time));
            next_start_time = (next_start_time + command.duration);
        }
        const last_scheduled = sequenced.at(-1);
        return {
            schedule_stop: (stop_at) => {
                for (const scheduled of sequenced) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time);
            },
            add_on_stop_listener: (listener) => {
                last_scheduled?.add_on_stop_listener(listener);
            }
        };
    }
    async compile(_) {
        return this;
    }
    attach_to(output_node) {
        return new Attached(this, output_node);
    }
}
class Gain {
    to_gain;
    gain_keyframes;
    constructor(to_gain, gain_keyframes) {
        this.to_gain = to_gain;
        this.gain_keyframes = gain_keyframes;
    }
    async compile(context) {
        return new CompiledGain(await this.to_gain.compile(context), this.gain_keyframes);
    }
}
class CompiledGain {
    to_gain;
    gain_keyframes;
    get duration() {
        return this.to_gain.duration;
    }
    constructor(to_gain, gain_keyframes) {
        this.to_gain = to_gain;
        this.gain_keyframes = gain_keyframes;
    }
    schedule_play(output_node, play_at, maybe_offset) {
        const context = output_node.context;
        const gain_node = context.createGain();
        gain_node.connect(output_node);
        const gain = gain_node.gain;
        const start_time = pinpoint(play_at, context.currentTime);
        const offset = maybe_offset ?? 0;
        const scheduled = this.to_gain.schedule_play(gain_node, start_time, offset);
        const original_value = gain.value;
        for (const { transition, value, from_start } of this.gain_keyframes) {
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
            value_changer(value, Math.max(0, (start_time + from_start) - offset));
        }
        scheduled.add_on_stop_listener((_) => {
            gain_node.disconnect();
        });
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
            add_on_stop_listener: (listener) => scheduled.add_on_stop_listener(listener)
        };
    }
    async compile(_) {
        return this;
    }
    attach_to(output_node) {
        return new Attached(this, output_node);
    }
}
class Attached {
    compiled;
    attach_to;
    constructor(compiled, attach_to) {
        this.compiled = compiled;
        this.attach_to = attach_to;
    }
    get duration() {
        return this.compiled.duration;
    }
    schedule_play(play_at, maybe_offset) {
        return this.compiled.schedule_play(this.attach_to, play_at, maybe_offset);
    }
    detach() {
        return this.compiled;
    }
}
class RhythmContext {
    context;
    constructor(context) {
        this.context = context ?? new AudioContext();
    }
    get current_time() {
        return this.context.currentTime;
    }
    async compile_attached(command) {
        return this.attach(await this.compile(command));
    }
    attach(command) {
        return command.attach_to(this.context.destination);
    }
    compile(command) {
        return command.compile(this.context);
    }
}

export { Clip, CompiledClip, CompiledGain, CompiledPlay, CompiledRepeat, CompiledSequence, Gain, Play, Repeat, RhythmContext, Sequence };
