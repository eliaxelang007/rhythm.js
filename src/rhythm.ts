type NewType<T> = T & { readonly __brand: unique symbol };

type Seconds = NewType<number>;
type TimeCoordinate = NewType<Seconds>;

type OnStopListener = (event: Event) => any;

interface Stoppable {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
    add_on_stop_listener(listener: OnStopListener): void;
}

interface Playable<Scheduled extends Stoppable> {
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    get duration(): Seconds;
}

interface AudioCommand<
    Scheduled extends Stoppable,
    CompileTo extends CompiledAudioCommand<Scheduled, CompileTo>
> {
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompileTo>;
}

interface CompiledAudioCommand<
    Scheduled extends Stoppable,
    Self extends CompiledAudioCommand<Scheduled, Self>
> extends
    Playable<Scheduled>,
    AudioCommand<Scheduled, Self> {
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, Scheduled, Self>;
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
    add_on_stop_listener(listener: OnStopListener): void;
};

class Play implements AudioCommand<ScheduledCommand, CompiledPlay> {
    constructor(readonly path: string) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledPlay> {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();

        const audio_buffer = await context.decodeAudioData(array_buffer);

        return new CompiledPlay(audio_buffer);
    }
}

class CompiledPlay implements CompiledAudioCommand<ScheduledCommand, CompiledPlay> {
    readonly duration: Seconds;

    constructor(
        readonly buffer: AudioBuffer
    ) {
        this.duration = buffer.duration as Seconds;
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
        const context = output_node.context;

        const player = context.createBufferSource();

        player.buffer = this.buffer;

        const on_stop_listeners: OnStopListener[] = [
            (_) => player.disconnect()
        ];

        player.onended = (event) => {
            let listener: OnStopListener | undefined = undefined;

            while ((listener = on_stop_listeners.pop()) !== undefined) {
                listener(event);
            }
        };
        player.connect(output_node);

        const start_time = pinpoint(play_at, context.currentTime);

        player.start(start_time, maybe_offset);

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                player.stop(stop_at);
            },
            time_from_start: () => {
                return (context.currentTime - start_time) as Seconds;
            },
            add_on_stop_listener: (listener: OnStopListener) => on_stop_listeners.push(listener)
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledPlay> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledPlay> {
        return new Attached<OutputNode, ScheduledCommand, CompiledPlay>(
            this,
            output_node
        );
    }
}

class Clip<
    ChildScheduled extends Stoppable,
    ChildCompileTo extends CompiledAudioCommand<ChildScheduled, ChildCompileTo>,
    Child extends AudioCommand<ChildScheduled, ChildCompileTo>
> implements AudioCommand<ChildScheduled, CompiledClip<ChildScheduled, ChildCompileTo>> {
    constructor(
        readonly to_clip: Child,
        readonly duration: Seconds,
        readonly offset: Seconds = (0 as Seconds)
    ) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledClip<ChildScheduled, ChildCompileTo>> {
        return new CompiledClip(
            await this.to_clip.compile(context),
            this.duration,
            this.offset
        );
    }
}

class CompiledClip<
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<ChildScheduled, CompiledClip<ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_clip: CompiledChild,
        readonly duration: Seconds,
        readonly offset: Seconds = (0 as Seconds)
    ) {
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ChildScheduled {
        const start_time = pinpoint(play_at, output_node.context.currentTime);
        const offset = maybe_offset ?? 0;

        const command = this.to_clip;

        const scheduled = command.schedule_play(output_node, start_time, (this.offset + offset) as Seconds);
        scheduled.schedule_stop((start_time + (this.duration - offset)) as Seconds);

        return scheduled;
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledClip<ChildScheduled, CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ChildScheduled, CompiledClip<ChildScheduled, CompiledChild>> {
        return new Attached<OutputNode, ChildScheduled, CompiledClip<ChildScheduled, CompiledChild>>(
            this,
            output_node
        );
    }
}

class Repeat<
    ChildScheduled extends Stoppable,
    ChildCompileTo extends CompiledAudioCommand<ChildScheduled, ChildCompileTo>,
    Child extends AudioCommand<ChildScheduled, ChildCompileTo>
> implements AudioCommand<ScheduledCommand, CompiledRepeat<ChildScheduled, ChildCompileTo>> {
    constructor(
        readonly to_repeat: Child,
        readonly duration: Seconds
    ) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledRepeat<ChildScheduled, ChildCompileTo>> {
        return new CompiledRepeat(
            await this.to_repeat.compile(context),
            this.duration
        );
    }
}

class CompiledRepeat<
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<ScheduledCommand, CompiledRepeat<ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_repeat: CompiledChild,
        readonly duration: Seconds
    ) { }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
        const offset = maybe_offset ?? 0;

        const command = this.to_repeat;
        const command_duration = command.duration;
        const duration = this.duration;

        const context = output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);

        let remaining_duration = (duration - offset) as Seconds;
        let repeat_offset = (offset % command_duration) as Seconds;
        let til_next_repeat = start_time;

        const repeats: Stoppable[] = [];

        while (remaining_duration > 0) {
            repeats.push(command.schedule_play(output_node, til_next_repeat, repeat_offset as Seconds));

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
            add_on_stop_listener: (listener: OnStopListener) => {
                last_scheduled?.add_on_stop_listener(listener)
            }
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledRepeat<ChildScheduled, CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledRepeat<ChildScheduled, CompiledChild>> {
        return new Attached<OutputNode, ScheduledCommand, CompiledRepeat<ChildScheduled, CompiledChild>>(
            this,
            output_node
        );
    }
}

type AnyCompiledCommand = CompiledAudioCommand<Stoppable, AnyCompiledCommand>;
type AnyCommand = AudioCommand<Stoppable, AnyCompiledCommand>;

class Sequence implements AudioCommand<ScheduledCommand, CompiledSequence> {
    constructor(readonly sequence: AnyCommand[]) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledSequence> {
        return new CompiledSequence(
            await Promise.all(
                this.sequence.map((compilable) =>
                    compilable.compile(context)
                )
            )
        );
    }
}

class CompiledSequence implements CompiledAudioCommand<ScheduledCommand, CompiledSequence> {
    readonly duration: Seconds;

    constructor(
        readonly sequence: AnyCompiledCommand[],
    ) {
        this.duration = sequence
            .map((command) => command.duration)
            .reduce(
                (total_duration, duration) => total_duration + duration,
                0
            ) as Seconds;
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand {
        const context = output_node.context;

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
                sequenced.push(command.schedule_play(output_node, start_time, offset));

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

            sequenced.push(command.schedule_play(output_node, next_start_time));

            next_start_time = (next_start_time + command.duration) as Seconds;
        }

        const last_scheduled = sequenced.at(-1);

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                for (const scheduled of sequenced) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            time_from_start: () => {
                return (context.currentTime - start_time) as Seconds;
            },
            add_on_stop_listener: (listener: OnStopListener) => {
                last_scheduled?.add_on_stop_listener(listener)
            }
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledSequence> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledSequence> {
        return new Attached<OutputNode, ScheduledCommand, CompiledSequence>(
            this,
            output_node
        );
    }
}

type AudioParamTransition = undefined | "exponential" | "linear";

type GainKeyframe = {
    transition: AudioParamTransition;
    value: number;
    from_start: Seconds;
};

class Gain<
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>,
    Child extends AudioCommand<ChildScheduled, CompiledChild>
> implements AudioCommand<ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>> {
    constructor(
        readonly to_gain: Child,
        readonly gain_keyframes: GainKeyframe[]
    ) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledGain<ChildScheduled, CompiledChild>> {
        return new CompiledGain(
            await this.to_gain.compile(context),
            this.gain_keyframes
        );
    }
}

class CompiledGain<
    ChildScheduled extends Stoppable,
    CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>
> implements CompiledAudioCommand<ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>> {
    get duration(): Seconds {
        return this.to_gain.duration;
    }

    constructor(
        readonly to_gain: CompiledChild,
        readonly gain_keyframes: GainKeyframe[],
    ) { }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable {
        const context = output_node.context;
        const gain_node = context.createGain();

        gain_node.connect(output_node);

        const gain = gain_node.gain;

        const start_time = pinpoint(play_at, context.currentTime);
        const offset = maybe_offset ?? 0;

        const scheduled = this.to_gain.schedule_play(gain_node, start_time, offset as Seconds);

        const original_value = gain.value;

        for (const { transition, value, from_start } of this.gain_keyframes) {
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

            value_changer(value, Math.max(0, (start_time + from_start) - offset));
        }

        scheduled.add_on_stop_listener(
            (_) => {
                gain_node.disconnect();
            }
        );

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
            add_on_stop_listener: (listener: OnStopListener) => scheduled.add_on_stop_listener(listener)
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledGain<ChildScheduled, CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>> {
        return new Attached<OutputNode, ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>>(
            this,
            output_node
        );
    }
}

type CompileToOf<C> = C extends AudioCommand<any, infer To> ? To : never;

class Attached<
    OutputNode extends AudioNode,
    Scheduled extends Stoppable,
    Compiled extends CompiledAudioCommand<Scheduled, Compiled>,
> {
    constructor(
        readonly compiled: Compiled,
        readonly attach_to: OutputNode,
    ) { }

    get duration() {
        return this.compiled.duration;
    }

    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
        return this.compiled.schedule_play(this.attach_to, play_at, maybe_offset);
    }

    detach(): Compiled {
        return this.compiled;
    }
}

class RhythmContext {
    readonly context: AudioContext;

    constructor(context?: AudioContext) {
        this.context = context ?? new AudioContext();
    }

    get current_time(): TimeCoordinate {
        return this.context.currentTime as TimeCoordinate;
    }

    async compile_attached<
        Command extends AudioCommand<Stoppable, any>,
    >(
        command: Command
    ): Promise<Attached<AudioDestinationNode, Stoppable, CompileToOf<Command>>> {
        return this.attach(await this.compile(command));
    }

    attach<
        Scheduled extends Stoppable,
        CompiledCommand extends CompiledAudioCommand<Scheduled, CompiledCommand>,
    >(
        command: CompiledCommand,
    ): Attached<AudioDestinationNode, Stoppable, CompiledCommand> {
        return command.attach_to(this.context.destination);
    }

    compile<
        Command extends AudioCommand<Stoppable, any>,
    >(
        command: Command
    ): Promise<CompileToOf<Command>> {
        return command.compile(this.context);
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