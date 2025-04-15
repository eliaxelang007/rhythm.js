type NewType<T> = T & {
    readonly __brand: unique symbol;
};
type Seconds = NewType<number>;
type TimeCoordinate = NewType<Seconds>;
type OnStopListener = (event: Event) => any;
type Scheduled = {
    start_time: TimeCoordinate;
    end_time: TimeCoordinate;
    schedule_stop(stop_at?: TimeCoordinate): void;
    add_on_stop_listener(listener: OnStopListener): void;
};
interface Playable {
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    get duration(): Seconds;
}
interface AudioCommand<CompileTo extends CompiledAudioCommand<CompileTo>> {
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompileTo>;
}
interface CompiledAudioCommand<Self extends CompiledAudioCommand<Self>> extends Playable, AudioCommand<Self> {
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, Self>;
}
declare class Play implements AudioCommand<CompiledPlay> {
    readonly path: string;
    constructor(path: string);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledPlay>;
}
declare class CompiledPlay implements CompiledAudioCommand<CompiledPlay> {
    readonly buffer: AudioBuffer;
    readonly duration: Seconds;
    constructor(buffer: AudioBuffer);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledPlay>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledPlay>;
}
declare class Clip<ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>, Child extends AudioCommand<ChildCompileTo>> implements AudioCommand<CompiledClip<ChildCompileTo>> {
    readonly child: Child;
    readonly offset: Seconds;
    readonly duration: Seconds;
    constructor({ offset, duration }: {
        offset: Seconds;
        duration: Seconds;
    }, child: Child);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledClip<ChildCompileTo>>;
}
declare class CompiledClip<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledClip<CompiledChild>> {
    readonly child: CompiledChild;
    readonly offset: Seconds;
    readonly duration: Seconds;
    constructor(child: CompiledChild, offset: Seconds | undefined, duration: Seconds);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledClip<CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledClip<CompiledChild>>;
}
declare class Repeat<ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>, Child extends AudioCommand<ChildCompileTo>> implements AudioCommand<CompiledRepeat<ChildCompileTo>> {
    readonly child: Child;
    readonly duration: Seconds;
    constructor({ duration }: {
        duration: Seconds;
    }, child: Child);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledRepeat<ChildCompileTo>>;
}
declare class CompiledRepeat<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledRepeat<CompiledChild>> {
    readonly child: CompiledChild;
    readonly duration: Seconds;
    constructor(child: CompiledChild, duration: Seconds);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledRepeat<CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledRepeat<CompiledChild>>;
}
type AnyCompiledCommand = CompiledAudioCommand<AnyCompiledCommand>;
type AnyCommand = AudioCommand<AnyCompiledCommand>;
declare class Sequence implements AudioCommand<CompiledSequence> {
    readonly children: AnyCommand[];
    constructor(children: AnyCommand[]);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledSequence>;
}
declare class CompiledSequence implements CompiledAudioCommand<CompiledSequence> {
    readonly children: AnyCompiledCommand[];
    readonly duration: Seconds;
    constructor(children: AnyCompiledCommand[]);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledSequence>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledSequence>;
}
type AudioParamTransition = undefined | "exponential" | "linear";
type GainKeyframe = {
    transition: AudioParamTransition;
    value: number;
    from_start: Seconds;
};
declare class Gain<CompiledChild extends CompiledAudioCommand<CompiledChild>, Child extends AudioCommand<CompiledChild>> implements AudioCommand<CompiledGain<CompiledChild>> {
    readonly child: Child;
    readonly gain_keyframes: GainKeyframe[];
    constructor({ gain_keyframes }: {
        gain_keyframes: GainKeyframe[];
    }, child: Child);
    compile<Context extends BaseAudioContext>(context: Context): Promise<CompiledGain<CompiledChild>>;
}
declare class CompiledGain<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledGain<CompiledChild>> {
    readonly child: CompiledChild;
    readonly gain_keyframes: GainKeyframe[];
    get duration(): Seconds;
    constructor(child: CompiledChild, gain_keyframes: GainKeyframe[]);
    schedule_play<OutputNode extends AudioNode>(output_node: OutputNode, play_at?: TimeCoordinate, maybe_offset?: Seconds): Scheduled;
    compile<Context extends BaseAudioContext>(_: Context): Promise<CompiledGain<CompiledChild>>;
    attach_to<OutputNode extends AudioNode>(output_node: OutputNode): Attached<OutputNode, CompiledGain<CompiledChild>>;
}
type CompileToOf<C> = C extends AudioCommand<infer To> ? To : never;
declare class Attached<OutputNode extends AudioNode, Compiled extends CompiledAudioCommand<Compiled>> {
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
    compile_attached<Command extends AudioCommand<any>>(command: Command): Promise<Attached<AudioDestinationNode, CompileToOf<Command>>>;
    attach<CompiledCommand extends CompiledAudioCommand<CompiledCommand>>(command: CompiledCommand): Attached<AudioDestinationNode, CompiledCommand>;
    compile<Command extends AudioCommand<any>>(command: Command): Promise<CompileToOf<Command>>;
}
export { type Seconds, RhythmContext, Play, CompiledPlay, Clip, CompiledClip, Repeat, CompiledRepeat, Sequence, CompiledSequence, Gain, CompiledGain };
//# sourceMappingURL=rhythm.d.ts.map