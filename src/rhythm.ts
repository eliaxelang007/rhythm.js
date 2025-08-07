type NewType<T> = T & { readonly __brand: unique symbol };

type Seconds = NewType<number>;
type TimeCoordinate = NewType<Seconds>;

type OnStopListener = (event: Event) => any;

type Scheduled = {
    start_time: TimeCoordinate;
    end_time: TimeCoordinate;

    schedule_stop(stop_at?: TimeCoordinate): void;
    add_on_stop_listener(listener: OnStopListener): void;
}

interface Playable {
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    get duration(): Seconds;
}

interface AudioCommand<
    CompileTo extends CompiledAudioCommand<CompileTo>
> {
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompileTo>;
}

interface CompiledAudioCommand<
    Self extends CompiledAudioCommand<Self>
> extends
    Playable,
    AudioCommand<Self> {
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, Self>;
}

function pinpoint(coordinate: TimeCoordinate | undefined, current_time: number): TimeCoordinate {
    return (
        coordinate !== undefined &&
        coordinate !== 0
    ) ? coordinate : (current_time as TimeCoordinate);
}

class Play implements AudioCommand<CompiledPlay> {
    constructor(readonly path: string) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledPlay> {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();

        const audio_buffer = await context.decodeAudioData(array_buffer);

        return new CompiledPlay(audio_buffer);
    }
}

class CompiledPlay implements CompiledAudioCommand<CompiledPlay> {
    readonly duration: Seconds;

    constructor(
        readonly buffer: AudioBuffer
    ) {
        this.duration = buffer.duration as Seconds;
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
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

        const offset = maybe_offset ?? 0;

        player.start(start_time, offset);

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                player.stop(stop_at);
            },
            start_time: start_time,
            end_time: (start_time + (this.duration - offset)) as TimeCoordinate,
            add_on_stop_listener: (listener: OnStopListener) => on_stop_listeners.push(listener)
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledPlay> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledPlay> {
        return new Attached<OutputNode, CompiledPlay>(
            this,
            output_node
        );
    }
}

class Clip<
    ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>,
    Child extends AudioCommand<ChildCompileTo>
> implements AudioCommand<CompiledClip<ChildCompileTo>> {
    readonly offset: Seconds;
    readonly duration: Seconds;

    constructor(
        { offset, duration }: { offset: Seconds, duration: Seconds },
        readonly child: Child
    ) {
        this.offset = offset;
        this.duration = duration;
    }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledClip<ChildCompileTo>> {
        return new CompiledClip(
            await this.child.compile(context),
            this.offset,
            this.duration
        );
    }
}

class CompiledClip<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledClip<CompiledChild>> {
    constructor(
        readonly child: CompiledChild,
        readonly offset: Seconds = (0 as Seconds),
        readonly duration: Seconds
    ) {
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
        const start_time = pinpoint(play_at, output_node.context.currentTime);
        const offset = maybe_offset ?? 0;

        const command = this.child;

        const scheduled = command.schedule_play(output_node, start_time, (this.offset + offset) as Seconds);
        const end_time = (start_time + (this.duration - offset)) as TimeCoordinate;

        scheduled.schedule_stop(end_time);

        return {
            ...scheduled,
            end_time: end_time
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledClip<CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledClip<CompiledChild>> {
        return new Attached<OutputNode, CompiledClip<CompiledChild>>(
            this,
            output_node
        );
    }
}

class Repeat<
    ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>,
    Child extends AudioCommand<ChildCompileTo>
> implements AudioCommand<CompiledRepeat<ChildCompileTo>> {
    readonly duration: Seconds;

    constructor(
        { duration }: { duration: Seconds },
        readonly child: Child
    ) {
        this.duration = duration;
    }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledRepeat<ChildCompileTo>> {
        return new CompiledRepeat(
            await this.child.compile(context),
            this.duration
        );
    }
}

class CompiledRepeat<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledRepeat<CompiledChild>> {
    constructor(
        readonly child: CompiledChild,
        readonly duration: Seconds
    ) { }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
        const offset = maybe_offset ?? 0;

        const command = this.child;
        const command_duration = command.duration;
        const duration = this.duration;

        const context = output_node.context;
        const start_time = pinpoint(play_at, context.currentTime);

        let remaining_duration = (duration - offset) as Seconds;
        let repeat_offset = (offset % command_duration) as Seconds;
        let til_next_repeat = start_time;

        const repeats: Scheduled[] = [];

        while (remaining_duration > 0) {
            repeats.push(command.schedule_play(output_node, til_next_repeat, repeat_offset as Seconds));

            const repeat_duration = command_duration - repeat_offset;

            til_next_repeat = (til_next_repeat + repeat_duration) as Seconds;
            remaining_duration = (remaining_duration - repeat_duration) as Seconds;
            repeat_offset = 0 as Seconds;
        }

        const last_scheduled = repeats.at(-1);

        const end_time = start_time + (duration - offset) as TimeCoordinate;
        last_scheduled?.schedule_stop(end_time);

        return {
            schedule_stop: (stop_at?: TimeCoordinate) => {
                for (const scheduled of repeats) {
                    scheduled.schedule_stop(stop_at);
                }
            },
            start_time: start_time,
            end_time: end_time,
            add_on_stop_listener: (listener: OnStopListener) => {
                last_scheduled?.add_on_stop_listener(listener)
            }
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledRepeat<CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledRepeat<CompiledChild>> {
        return new Attached<OutputNode, CompiledRepeat<CompiledChild>>(
            this,
            output_node
        );
    }
}

type AnyCompiledCommand = CompiledAudioCommand<AnyCompiledCommand>;
type AnyCommand = AudioCommand<AnyCompiledCommand>;

class Sequence implements AudioCommand<CompiledSequence> {
    constructor(readonly children: AnyCommand[]) { }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledSequence> {
        return new CompiledSequence(
            await Promise.all(
                this.children.map((compilable) =>
                    compilable.compile(context)
                )
            )
        );
    }
}

class CompiledSequence implements CompiledAudioCommand<CompiledSequence> {
    readonly duration: Seconds;

    constructor(
        readonly children: AnyCompiledCommand[],
    ) {
        this.duration = children
            .map((command) => command.duration)
            .reduce(
                (total_duration, duration) => total_duration + duration,
                0
            ) as Seconds;
    }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
        const context = output_node.context;

        const start_time = pinpoint(play_at, context.currentTime);
        const offset = (maybe_offset ?? 0) as Seconds;

        let start_search_offset = offset;

        const iterator = this.children.values();

        let next_start_time = 0 as Seconds;

        const sequenced: Scheduled[] = [];

        while (true) {
            const { value: command, done } = iterator.next();

            if (done) {
                break;
            }

            const command_duration = command.duration;

            if (start_search_offset < command_duration) {
                sequenced.push(command.schedule_play(output_node, start_time, start_search_offset));

                next_start_time = (
                    start_time + (command_duration - start_search_offset)
                ) as Seconds;

                break;
            }

            start_search_offset = (start_search_offset - command_duration) as Seconds;
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
            start_time: start_time,
            end_time: (start_time + (this.duration - offset)) as TimeCoordinate,
            add_on_stop_listener: (listener: OnStopListener) => {
                last_scheduled?.add_on_stop_listener(listener)
            }
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledSequence> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledSequence> {
        return new Attached<OutputNode, CompiledSequence>(
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
    CompiledChild extends CompiledAudioCommand<CompiledChild>,
    Child extends AudioCommand<CompiledChild>
> implements AudioCommand<CompiledGain<CompiledChild>> {
    readonly gain_keyframes: GainKeyframe[];

    constructor(
        { gain_keyframes }: { gain_keyframes: GainKeyframe[] },
        readonly child: Child
    ) {
        this.gain_keyframes = gain_keyframes;
        this.child = child;
    }

    async compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledGain<CompiledChild>> {
        return new CompiledGain(
            await this.child.compile(context),
            this.gain_keyframes
        );
    }
}

class CompiledGain<
    CompiledChild extends CompiledAudioCommand<CompiledChild>
> implements CompiledAudioCommand<CompiledGain<CompiledChild>> {
    get duration(): Seconds {
        return this.child.duration;
    }

    constructor(
        readonly child: CompiledChild,
        readonly gain_keyframes: GainKeyframe[],
    ) { }

    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled {
        const context = output_node.context;
        const gain_node = context.createGain();

        gain_node.connect(output_node);

        const gain = gain_node.gain;

        const start_time = pinpoint(play_at, context.currentTime);
        const offset = maybe_offset ?? 0;

        const scheduled = this.child.schedule_play(gain_node, start_time, offset as Seconds);

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
            ...scheduled,
            schedule_stop: (stop_at?: TimeCoordinate) => {
                const stop_time = pinpoint(stop_at, context.currentTime);

                scheduled.schedule_stop(stop_at);

                gain.cancelScheduledValues(stop_time);
                gain.setValueAtTime(original_value, stop_time);
            }
        };
    }

    async compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledGain<CompiledChild>> {
        return this;
    }

    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledGain<CompiledChild>> {
        return new Attached<OutputNode, CompiledGain<CompiledChild>>(
            this,
            output_node
        );
    }
}

type CompileToOf<C> = C extends AudioCommand<infer To> ? To : never;

class Attached<
    OutputNode extends AudioNode,
    Compiled extends CompiledAudioCommand<Compiled>
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
        Command extends AudioCommand<any>,
    >(
        command: Command
    ): Promise<Attached<AudioDestinationNode, CompileToOf<Command>>> {
        return this.attach(await this.compile(command));
    }

    attach<
        CompiledCommand extends CompiledAudioCommand<CompiledCommand>,
    >(
        command: CompiledCommand,
    ): Attached<AudioDestinationNode, CompiledCommand> {
        return command.attach_to(this.context.destination);
    }

    compile<
        Command extends AudioCommand<any>,
    >(
        command: Command
    ): Promise<CompileToOf<Command>> {
        return command.compile(this.context);
    }
}

export {
    type NewType,
    type Seconds,
    type TimeCoordinate,
    type OnStopListener,
    type Scheduled,
    type Playable,
    type AudioCommand,
    type CompiledAudioCommand,
    type AudioParamTransition,
    type GainKeyframe,
    type AnyCommand,
    type AnyCompiledCommand,
    type CompileToOf,

    RhythmContext,
    Attached,

    Play,
    CompiledPlay,
    Clip,
    CompiledClip,
    Repeat,
    CompiledRepeat,
    Sequence,
    CompiledSequence,
    Gain,
    CompiledGain,
};