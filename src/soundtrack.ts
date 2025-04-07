
type NewType<T> = T & { readonly __brand: unique symbol };
type Seconds = NewType<number>;

type TimeCoordinate = NewType<Seconds>;

function pinpoint(coordinate: TimeCoordinate | undefined, current_time: number): TimeCoordinate {
    return (
        coordinate !== undefined &&
        coordinate !== 0
    ) ? coordinate : (current_time as TimeCoordinate);
}

interface Stoppable {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
}

interface Playable {
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    get duration(): Seconds;
}

interface Outputter {
    get output_node(): AudioNode;
}

interface AudioCommand<
    CompileTo extends CompiledAudioCommand<CompileTo>,
> {
    compile(output_node: AudioNode): Promise<CompileTo>;
}

interface CompiledAudioCommand<
    Self extends CompiledAudioCommand<Self>,
> extends Playable,
    Outputter,
    AudioCommand<Self> { }

class Play implements AudioCommand<CompiledPlay> {
    constructor(readonly path: string) {
        this.path = path;
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledPlay> {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();

        const context = output_node.context;
        const audio_buffer = await context.decodeAudioData(array_buffer);

        return new CompiledPlay(output_node, audio_buffer);
    }
}

class CompiledPlay implements CompiledAudioCommand<CompiledPlay> {
    readonly duration: Seconds;

    constructor(
        readonly output_node: AudioNode,
        readonly buffer: AudioBuffer
    ) {
        this.output_node = output_node;
        this.buffer = buffer;
        this.duration = buffer.duration as Seconds;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
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
            schedule_stop: (stop_at?: TimeCoordinate) => {
                player.stop(stop_at);
            },
            time_from_start: () => {
                return (context.currentTime - start_time) as Seconds;
            }
        };
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledPlay> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledPlay(output_node, this.buffer);
    }
}

class Clip<
    ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>,
    Child extends AudioCommand<ChildCompileTo>
> implements AudioCommand<CompiledClip<ChildCompileTo>> {
    constructor(
        readonly to_clip: Child,
        readonly offset: Seconds,
        readonly duration: Seconds
    ) { }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledClip<ChildCompileTo>> {
        return new CompiledClip(
            await this.to_clip.compile(output_node),
            this.offset,
            this.duration
        );
    }
}

class CompiledClip<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledClip<CompiledChild>> {
    constructor(
        readonly to_clip: CompiledChild,
        readonly offset: Seconds,
        readonly duration: Seconds
    ) {
    }

    get output_node(): AudioNode {
        return this.to_clip.output_node;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
        const start_time = pinpoint(play_at, this.output_node.context.currentTime);
        const offset = maybe_offset ?? 0;

        const command = this.to_clip;

        const scheduled = command.schedule_play(start_time, (this.offset + offset) as Seconds);
        scheduled.schedule_stop((start_time + (this.duration - offset)) as Seconds);

        return scheduled;
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledClip<CompiledChild>> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledClip(
            await this.to_clip.compile(output_node),
            this.offset,
            this.duration
        );
    }
}


class Repeat<
    ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>,
    Child extends AudioCommand<ChildCompileTo>
> implements AudioCommand<CompiledRepeat<ChildCompileTo>> {
    constructor(
        readonly to_repeat: Child,
        readonly duration: Seconds
    ) { }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledRepeat<ChildCompileTo>> {
        return new CompiledRepeat(
            await this.to_repeat.compile(output_node),
            this.duration
        );
    }
}

class CompiledRepeat<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledRepeat<CompiledChild>> {
    constructor(
        readonly to_repeat: CompiledChild,
        readonly duration: Seconds
    ) { }

    get output_node(): AudioNode {
        return this.to_repeat.output_node;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
        const offset = maybe_offset ?? 0;

        const command = this.to_repeat;
        const command_duration = command.duration;
        const duration = this.duration;

        const context = this.output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);

        let remaining_duration = (duration - offset) as Seconds;
        let repeat_offset = (offset % command_duration) as Seconds;
        let til_next_repeat = start_time;

        const repeats: Stoppable[] = [];

        while (remaining_duration > 0) {
            repeats.push(command.schedule_play(til_next_repeat, repeat_offset as Seconds));

            const repeat_duration = command_duration - repeat_offset;

            til_next_repeat = (til_next_repeat + repeat_duration) as Seconds;
            remaining_duration = (remaining_duration - repeat_duration) as Seconds;
            repeat_offset = 0 as Seconds;
        }

        const last_scheduled = repeats.at(-1);

        last_scheduled?.schedule_stop(start_time + (duration - offset) as Seconds);

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                for (const scheduled of repeats) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time) as Seconds;
            },
        };
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledRepeat<CompiledChild>> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledRepeat(
            await this.to_repeat.compile(output_node),
            this.duration
        );
    }
}

type AnyCompiledCommand = CompiledAudioCommand<any>;
type AnyCommand = AudioCommand<AnyCompiledCommand>;

class Sequence implements AudioCommand<CompiledSequence> {
    readonly sequence: AnyCommand[];

    constructor(sequence: AnyCommand[]) {
        this.sequence = sequence;
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledSequence> {
        return new CompiledSequence(
            output_node,
            await Promise.all(
                this.sequence.map((compilable) =>
                    compilable.compile(output_node)
                )
            )
        );
    }
}

class CompiledSequence implements CompiledAudioCommand<CompiledSequence> {
    readonly duration: Seconds;

    constructor(
        readonly output_node: AudioNode,
        readonly sequence: AnyCompiledCommand[],
    ) {
        this.duration = sequence
            .map((command) => command.duration)
            .reduce(
                (total_duration, duration) => total_duration + duration,
                0
            ) as Seconds;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
        const context = this.output_node.context;

        const start_time = pinpoint(play_at, context.currentTime);
        let offset = (maybe_offset ?? 0) as Seconds;

        const iterator = this.sequence.values();

        let next_start_time = 0 as Seconds;

        const sequenced: Stoppable[] = [];

        while (true) {
            const { value: command, done } = iterator.next();

            if (done) {
                break;
            }

            const command_duration = command.duration;

            if (offset < command_duration) {
                sequenced.push(command.schedule_play(start_time, offset));

                next_start_time = (
                    start_time + (command_duration - offset)
                ) as Seconds;

                break;
            }

            offset = (offset - command_duration) as Seconds;
        }

        while (true) {
            const { value: command, done } = iterator.next();

            if (done) {
                break;
            }

            sequenced.push(command.schedule_play(next_start_time));

            next_start_time = (next_start_time + command.duration) as Seconds;
        }

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                for (const scheduled of sequenced) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time) as Seconds;
            },
        };
    }

    async compile(
        output_node: AudioNode
    ): Promise<CompiledSequence> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledSequence(
            this.output_node,
            await Promise.all(
                this.sequence.map((command) => command.compile(output_node))
            )
        );
    }
}

type AudioParamTransition = undefined | "exponential" | "linear";

type GainCommand = {
    transition?: AudioParamTransition;
    value: number;
    when_from_start: Seconds;
};

class Gain<
    ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>,
    Child extends AudioCommand<ChildCompileTo>
> implements AudioCommand<CompiledGain<ChildCompileTo>> {
    constructor(
        readonly command: Child,
        readonly gain_commands: GainCommand[]
    ) { }

    async compile(output_node: AudioNode): Promise<CompiledGain<ChildCompileTo>> {
        const gain_node = output_node.context.createGain();

        return new CompiledGain(
            gain_node,
            output_node,
            await this.command.compile(gain_node),
            this.gain_commands
        );
    }
}

class CompiledGain<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledGain<CompiledChild>> {
    get duration(): Seconds {
        return this.to_gain.duration;
    }

    constructor(
        readonly gain_node: GainNode,
        readonly output_node: AudioNode,
        readonly to_gain: CompiledChild,
        readonly gain_commands: GainCommand[],
    ) {
        gain_node.connect(output_node);
    }

    schedule_play(play_at?: Seconds, maybe_offset?: Seconds): Stoppable {
        const context = this.output_node.context;

        const start_time = pinpoint(play_at, context.currentTime);
        const offset = maybe_offset ?? 0;

        const scheduled = this.to_gain.schedule_play(start_time, offset as Seconds);

        const gain = this.gain_node.gain;
        const original_value = gain.value;

        for (const { transition, value, when_from_start } of this.gain_commands) {
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

            value_changer(value, Math.max(0, (start_time + when_from_start) - offset));
        }

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                const stop_time = pinpoint(stop_at, context.currentTime);

                scheduled.schedule_stop(play_at);

                gain.cancelScheduledValues(stop_time);
                gain.setValueAtTime(original_value, stop_time);
            },
            time_from_start: () => {
                return scheduled.time_from_start();
            },
        };
    }

    async compile(other_output_node: AudioNode): Promise<CompiledGain<CompiledChild>> {
        if (this.output_node === other_output_node) {
            return this;
        }

        const gain_node = other_output_node.context.createGain();

        return new CompiledGain(
            gain_node,
            other_output_node,
            await this.to_gain.compile(gain_node),
            this.gain_commands
        );
    }
}

class SoundtrackContext {
    readonly context: AudioContext;

    constructor(context?: AudioContext) {
        this.context = context ?? new AudioContext();
    }

    load<
        CompileTo extends CompiledAudioCommand<CompileTo>,
        Command extends AudioCommand<CompileTo>
    >(command: Command): Promise<CompileTo> {
        return command.compile(this.context.destination);
    }

    get current_time(): TimeCoordinate {
        return this.context.currentTime as TimeCoordinate;
    }
}

export {
    type Seconds,
    SoundtrackContext,
    Play,
    CompiledPlay,
    Clip,
    CompiledClip,
    Repeat,
    CompiledRepeat,
    Sequence,
    CompiledSequence,
    Gain,
    CompiledGain
};