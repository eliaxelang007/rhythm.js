type NewType<T> = T & {
    readonly __brand: unique symbol;
};
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
interface AudioCommand<Scheduled extends Stoppable, CompileTo extends CompiledAudioCommand<Scheduled, CompileTo>> {
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompileTo>;
}
interface CompiledAudioCommand<Scheduled extends Stoppable, Self extends CompiledAudioCommand<Scheduled, Self>> extends Playable<Scheduled>, AudioCommand<Scheduled, Self> {
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, Scheduled, Self>;
}
type ScheduledCommand = {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
    add_on_stop_listener(listener: OnStopListener): void;
};
declare class Play implements AudioCommand<ScheduledCommand, CompiledPlay> {
    readonly path: string;
    constructor(path: string);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledPlay>;
}
declare class CompiledPlay implements CompiledAudioCommand<ScheduledCommand, CompiledPlay> {
    readonly buffer: AudioBuffer;
    readonly duration: Seconds;
    constructor(buffer: AudioBuffer);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledPlay>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledPlay>;
}
declare class Clip<ChildScheduled extends Stoppable, ChildCompileTo extends CompiledAudioCommand<ChildScheduled, ChildCompileTo>, Child extends AudioCommand<ChildScheduled, ChildCompileTo>> implements AudioCommand<ChildScheduled, CompiledClip<ChildScheduled, ChildCompileTo>> {
    readonly to_clip: Child;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: Child, duration: Seconds, offset?: Seconds);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledClip<ChildScheduled, ChildCompileTo>>;
}
declare class CompiledClip<ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>> implements CompiledAudioCommand<ChildScheduled, CompiledClip<ChildScheduled, CompiledChild>> {
    readonly to_clip: CompiledChild;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: CompiledChild, duration: Seconds, offset?: Seconds);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ChildScheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledClip<ChildScheduled, CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ChildScheduled, CompiledClip<ChildScheduled, CompiledChild>>;
}
declare class Repeat<ChildScheduled extends Stoppable, ChildCompileTo extends CompiledAudioCommand<ChildScheduled, ChildCompileTo>, Child extends AudioCommand<ChildScheduled, ChildCompileTo>> implements AudioCommand<ScheduledCommand, CompiledRepeat<ChildScheduled, ChildCompileTo>> {
    readonly to_repeat: Child;
    readonly duration: Seconds;
    constructor(to_repeat: Child, duration: Seconds);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledRepeat<ChildScheduled, ChildCompileTo>>;
}
declare class CompiledRepeat<ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>> implements CompiledAudioCommand<ScheduledCommand, CompiledRepeat<ChildScheduled, CompiledChild>> {
    readonly to_repeat: CompiledChild;
    readonly duration: Seconds;
    constructor(to_repeat: CompiledChild, duration: Seconds);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledRepeat<ChildScheduled, CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledRepeat<ChildScheduled, CompiledChild>>;
}
type AnyCompiledCommand = CompiledAudioCommand<Stoppable, AnyCompiledCommand>;
type AnyCommand = AudioCommand<Stoppable, AnyCompiledCommand>;
declare class Sequence implements AudioCommand<ScheduledCommand, CompiledSequence> {
    readonly sequence: AnyCommand[];
    constructor(sequence: AnyCommand[]);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledSequence>;
}
declare class CompiledSequence implements CompiledAudioCommand<ScheduledCommand, CompiledSequence> {
    readonly sequence: AnyCompiledCommand[];
    readonly duration: Seconds;
    constructor(sequence: AnyCompiledCommand[]);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledSequence>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledSequence>;
}
type AudioParamTransition = undefined | "exponential" | "linear";
type GainKeyframe = {
    transition: AudioParamTransition;
    value: number;
    from_start: Seconds;
};
declare class Gain<ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>, Child extends AudioCommand<ChildScheduled, CompiledChild>> implements AudioCommand<ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>> {
    readonly to_gain: Child;
    readonly gain_keyframes: GainKeyframe[];
    constructor(to_gain: Child, gain_keyframes: GainKeyframe[]);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledGain<ChildScheduled, CompiledChild>>;
}
declare class CompiledGain<ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildScheduled, CompiledChild>> implements CompiledAudioCommand<ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>> {
    readonly to_gain: CompiledChild;
    readonly gain_keyframes: GainKeyframe[];
    get duration(): Seconds;
    constructor(to_gain: CompiledChild, gain_keyframes: GainKeyframe[]);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledGain<ChildScheduled, CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, ScheduledCommand, CompiledGain<ChildScheduled, CompiledChild>>;
}
type CompileToOf<C> = C extends AudioCommand<any, infer To> ? To : never;
declare class Attached<OutputNode extends AudioNode, Scheduled extends Stoppable, Compiled extends CompiledAudioCommand<Scheduled, Compiled>> {
    readonly compiled: Compiled;
    readonly attach_to: OutputNode;
    constructor(compiled: Compiled, attach_to: OutputNode);
    get duration(): Seconds;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    detach(): Compiled;
}
declare class RhythmContext {
    readonly context: AudioContext;
    constructor(context?: AudioContext);
    get current_time(): TimeCoordinate;
    compile_attached<Command extends AudioCommand<Stoppable, any>>(command: Command): Promise<Attached<AudioDestinationNode, Stoppable, CompileToOf<Command>>>;
    attach<Scheduled extends Stoppable, CompiledCommand extends CompiledAudioCommand<Scheduled, CompiledCommand>>(command: CompiledCommand): Attached<AudioDestinationNode, Stoppable, CompiledCommand>;
    compile<Command extends AudioCommand<Stoppable, any>>(command: Command): Promise<CompileToOf<Command>>;
}
export { type Seconds, RhythmContext, Play, CompiledPlay, Clip, CompiledClip, Repeat, CompiledRepeat, Sequence, CompiledSequence, Gain, CompiledGain };
//# sourceMappingURL=rhythm.d.ts.map