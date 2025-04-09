type NewType<T> = T & { readonly __brand: unique symbol };
type Seconds = NewType<number>;

type TimeCoordinate = NewType<Seconds>;

interface Stoppable {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
}

interface Playable<Scheduled extends Stoppable> {
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    get duration(): Seconds;
}

interface Outputter<OutputNode extends AudioNode> {
    get output_node(): OutputNode;
}

interface AudioCommand<
    OutputNode extends AudioNode,
    Scheduled extends Stoppable,
    CompileTo extends CompiledAudioCommand<OutputNode, Scheduled, CompileTo>
> {
    compile(output_node: OutputNode): Promise<CompileTo>;
}

interface CompiledAudioCommand<
    OutputNode extends AudioNode,
    Scheduled extends Stoppable,
    Self extends CompiledAudioCommand<OutputNode, Scheduled, Self>
> extends
    Outputter<OutputNode>,
    Playable<Scheduled>,
    AudioCommand<OutputNode, Scheduled, Self
    > {
    dispose(): void;
}

function pinpoint(coordinate: TimeCoordinate | undefined, current_time: number): TimeCoordinate {
    return (
        coordinate !== undefined &&
        coordinate !== 0
    ) ? coordinate : (current_time as TimeCoordinate);
}

type ScheduledCommand = {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
};

class Play<
    OutputNode extends AudioNode
> implements
    AudioCommand<OutputNode, ScheduledCommand, CompiledPlay<OutputNode>> {
    constructor(readonly path: string) { }

    async compile(
        output_node: OutputNode
    ): Promise<CompiledPlay<OutputNode>> {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();

        const context = output_node.context;
        const audio_buffer = await context.decodeAudioData(array_buffer);

        return new CompiledPlay(output_node, audio_buffer);
    }
}

class CompiledPlay<
    OutputNode extends AudioNode
> implements
    CompiledAudioCommand<OutputNode, ScheduledCommand, CompiledPlay<OutputNode>> {
    readonly duration: Seconds;

    constructor(
        readonly output_node: OutputNode,
        readonly buffer: AudioBuffer
    ) {
        this.duration = buffer.duration as Seconds;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
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
        output_node: OutputNode
    ): Promise<CompiledPlay<OutputNode>> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledPlay(output_node, this.buffer);
    }

    dispose() { }
}

class Clip<
    ChildOutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    ChildCompileTo extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>,
    Child extends AudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>
> implements AudioCommand<ChildOutputNode, ChildScheduled, CompiledClip<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
    constructor(
        readonly to_clip: Child,
        readonly duration: Seconds,
        readonly offset: Seconds = (0 as Seconds)
    ) { }

    async compile(
        output_node: ChildOutputNode
    ): Promise<CompiledClip<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
        return new CompiledClip(
            await this.to_clip.compile(output_node),
            this.duration,
            this.offset
        );
    }
}

class CompiledClip<
    ChildOutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledClip<ChildOutputNode, ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_clip: CompiledChild,
        readonly duration: Seconds,
        readonly offset: Seconds = (0 as Seconds)
    ) {
    }

    get output_node(): ChildOutputNode {
        return this.to_clip.output_node;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ChildScheduled {
        const start_time = pinpoint(play_at, this.output_node.context.currentTime);
        const offset = maybe_offset ?? 0;

        const command = this.to_clip;

        const scheduled = command.schedule_play(start_time, (this.offset + offset) as Seconds);
        scheduled.schedule_stop((start_time + (this.duration - offset)) as Seconds);

        return scheduled;
    }

    async compile(
        output_node: ChildOutputNode
    ): Promise<CompiledClip<ChildOutputNode, ChildScheduled, CompiledChild>> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledClip(
            await this.to_clip.compile(output_node),
            this.duration,
            this.offset
        );
    }

    dispose() {
        this.to_clip.dispose();
    }
}

class Repeat<
    ChildOutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    ChildCompileTo extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>,
    Child extends AudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>
> implements AudioCommand<ChildOutputNode, ScheduledCommand, CompiledRepeat<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
    constructor(
        readonly to_repeat: Child,
        readonly duration: Seconds
    ) { }

    async compile(
        output_node: ChildOutputNode
    ): Promise<CompiledRepeat<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
        return new CompiledRepeat(
            await this.to_repeat.compile(output_node),
            this.duration
        );
    }
}

class CompiledRepeat<
    ChildOutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<ChildOutputNode, ScheduledCommand, CompiledRepeat<ChildOutputNode, ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_repeat: CompiledChild,
        readonly duration: Seconds
    ) { }

    get output_node(): ChildOutputNode {
        return this.to_repeat.output_node;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
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
        output_node: ChildOutputNode
    ): Promise<CompiledRepeat<ChildOutputNode, ChildScheduled, CompiledChild>> {
        if (this.output_node === output_node) {
            return this;
        }

        return new CompiledRepeat(
            await this.to_repeat.compile(output_node),
            this.duration
        );
    }

    dispose(): void {
        this.to_repeat.dispose();
    }
}

type AnyCompiledCommand<OutputNode extends AudioNode> = CompiledAudioCommand<OutputNode, Stoppable, AnyCompiledCommand<OutputNode>>;
type AnyCommand<OutputNode extends AudioNode> = AudioCommand<OutputNode, Stoppable, AnyCompiledCommand<OutputNode>>;

class Sequence<
    ChildOutputNode extends AudioNode
> implements AudioCommand<ChildOutputNode, ScheduledCommand, CompiledSequence<ChildOutputNode>> {
    constructor(readonly sequence: AnyCommand<ChildOutputNode>[]) { }

    async compile(
        output_node: ChildOutputNode
    ): Promise<CompiledSequence<ChildOutputNode>> {
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

class CompiledSequence<
    ChildOutputNode extends AudioNode
> implements CompiledAudioCommand<ChildOutputNode, ScheduledCommand, CompiledSequence<ChildOutputNode>> {
    readonly duration: Seconds;

    constructor(
        readonly output_node: ChildOutputNode,
        readonly sequence: AnyCompiledCommand<ChildOutputNode>[],
    ) {
        this.duration = sequence
            .map((command) => command.duration)
            .reduce(
                (total_duration, duration) => total_duration + duration,
                0
            ) as Seconds;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
        const context = this.output_node.context;

        const start_time = pinpoint(play_at, context.currentTime);
        let offset = (maybe_offset ?? 0) as Seconds;

        const iterator = this.sequence.values();

        let next_start_time = 0 as Seconds;

        const sequenced: ScheduledCommand[] = [];

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
        output_node: ChildOutputNode
    ): Promise<CompiledSequence<ChildOutputNode>> {
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

    dispose(): void {
        for (const command of this.sequence) {
            command.dispose();
        }
    }
}

type AudioParamTransition = undefined | "exponential" | "linear";

type GainCommand = {
    transition: AudioParamTransition;
    value: number;
    when_from_start: Seconds;
};

class Gain<
    OutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<AudioNode, ChildScheduled, CompiledChild>,
    Child extends AudioCommand<AudioNode, ChildScheduled, CompiledChild>
> implements AudioCommand<OutputNode, ScheduledCommand, CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_gain: Child,
        readonly gain_commands: GainCommand[]
    ) { }

    async compile(output_node: OutputNode): Promise<CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
        const gain_node = output_node.context.createGain();

        return new CompiledGain(
            gain_node,
            output_node,
            await this.to_gain.compile(gain_node),
            this.gain_commands
        );
    }
}

class CompiledGain<
    OutputNode extends AudioNode,
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<AudioNode, ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<OutputNode, ScheduledCommand, CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
    get duration(): Seconds {
        return this.to_gain.duration;
    }

    constructor(
        readonly gain_node: GainNode,
        readonly output_node: OutputNode,
        readonly to_gain: CompiledChild,
        readonly gain_commands: GainCommand[],
    ) {
        gain_node.connect(output_node);
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
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
                        return (value: number, start_time: number) => gain.setValueAtTime(value, start_time);
                    }

                    case "exponential": {
                        return (value: number, start_time: number) => gain.exponentialRampToValueAtTime(value, start_time);
                    }

                    case "linear": {
                        return (value: number, start_time: number) => gain.linearRampToValueAtTime(value, start_time);
                    }
                }
            })();

            value_changer(value, Math.max(0, (start_time + when_from_start) - offset));
        }

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
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

    async compile(other_output_node: OutputNode): Promise<CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
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

    dispose(): void {
        this.to_gain.dispose();
        this.gain_node.disconnect();
    }
}

type CompileToOf<C> = C extends AudioCommand<any, any, infer To> ? To : never;

class RhythmContext {
    readonly context: AudioContext;

    constructor(context?: AudioContext) {
        this.context = context ?? new AudioContext();
    }

    compile<
        Command extends AudioCommand<AudioDestinationNode, Stoppable, any>
    >(
        command: Command
    ): Promise<CompileToOf<Command>> {
        return command.compile(this.context.destination);
    }

    get current_time(): TimeCoordinate {
        return this.context.currentTime as TimeCoordinate;
    }
}

export {
    type Seconds,
    RhythmContext,
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