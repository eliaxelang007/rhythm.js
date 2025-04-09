type NewType<T> = T & {
    readonly __brand: unique symbol;
};
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
interface AudioCommand<OutputNode extends AudioNode, Scheduled extends Stoppable, CompileTo extends CompiledAudioCommand<OutputNode, Scheduled, CompileTo>> {
    compile(output_node: OutputNode): Promise<CompileTo>;
}
interface CompiledAudioCommand<OutputNode extends AudioNode, Scheduled extends Stoppable, Self extends CompiledAudioCommand<OutputNode, Scheduled, Self>> extends Outputter<OutputNode>, Playable<Scheduled>, AudioCommand<OutputNode, Scheduled, Self> {
    dispose(): void;
}
type ScheduledCommand = {
    time_from_start(): Seconds;
    schedule_stop(stop_at?: TimeCoordinate): void;
};
declare class Play<OutputNode extends AudioNode> implements AudioCommand<OutputNode, ScheduledCommand, CompiledPlay<OutputNode>> {
    readonly path: string;
    constructor(path: string);
    compile(output_node: OutputNode): Promise<CompiledPlay<OutputNode>>;
}
declare class CompiledPlay<OutputNode extends AudioNode> implements CompiledAudioCommand<OutputNode, ScheduledCommand, CompiledPlay<OutputNode>> {
    readonly output_node: OutputNode;
    readonly buffer: AudioBuffer;
    readonly duration: Seconds;
    constructor(output_node: OutputNode, buffer: AudioBuffer);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile(output_node: OutputNode): Promise<CompiledPlay<OutputNode>>;
    dispose(): void;
}
declare class Clip<ChildOutputNode extends AudioNode, ChildScheduled extends Stoppable, ChildCompileTo extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>, Child extends AudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>> implements AudioCommand<ChildOutputNode, ChildScheduled, CompiledClip<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
    readonly to_clip: Child;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: Child, duration: Seconds, offset?: Seconds);
    compile(output_node: ChildOutputNode): Promise<CompiledClip<ChildOutputNode, ChildScheduled, ChildCompileTo>>;
}
declare class CompiledClip<ChildOutputNode extends AudioNode, ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledChild>> implements CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledClip<ChildOutputNode, ChildScheduled, CompiledChild>> {
    readonly to_clip: CompiledChild;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: CompiledChild, duration: Seconds, offset?: Seconds);
    get output_node(): ChildOutputNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ChildScheduled;
    compile(output_node: ChildOutputNode): Promise<CompiledClip<ChildOutputNode, ChildScheduled, CompiledChild>>;
    dispose(): void;
}
declare class Repeat<ChildOutputNode extends AudioNode, ChildScheduled extends Stoppable, ChildCompileTo extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>, Child extends AudioCommand<ChildOutputNode, ChildScheduled, ChildCompileTo>> implements AudioCommand<ChildOutputNode, ScheduledCommand, CompiledRepeat<ChildOutputNode, ChildScheduled, ChildCompileTo>> {
    readonly to_repeat: Child;
    readonly duration: Seconds;
    constructor(to_repeat: Child, duration: Seconds);
    compile(output_node: ChildOutputNode): Promise<CompiledRepeat<ChildOutputNode, ChildScheduled, ChildCompileTo>>;
}
declare class CompiledRepeat<ChildOutputNode extends AudioNode, ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<ChildOutputNode, ChildScheduled, CompiledChild>> implements CompiledAudioCommand<ChildOutputNode, ScheduledCommand, CompiledRepeat<ChildOutputNode, ChildScheduled, CompiledChild>> {
    readonly to_repeat: CompiledChild;
    readonly duration: Seconds;
    constructor(to_repeat: CompiledChild, duration: Seconds);
    get output_node(): ChildOutputNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile(output_node: ChildOutputNode): Promise<CompiledRepeat<ChildOutputNode, ChildScheduled, CompiledChild>>;
    dispose(): void;
}
type AnyCompiledCommand<OutputNode extends AudioNode> = CompiledAudioCommand<OutputNode, Stoppable, AnyCompiledCommand<OutputNode>>;
type AnyCommand<OutputNode extends AudioNode> = AudioCommand<OutputNode, Stoppable, AnyCompiledCommand<OutputNode>>;
declare class Sequence<ChildOutputNode extends AudioNode> implements AudioCommand<ChildOutputNode, ScheduledCommand, CompiledSequence<ChildOutputNode>> {
    readonly sequence: AnyCommand<ChildOutputNode>[];
    constructor(sequence: AnyCommand<ChildOutputNode>[]);
    compile(output_node: ChildOutputNode): Promise<CompiledSequence<ChildOutputNode>>;
}
declare class CompiledSequence<ChildOutputNode extends AudioNode> implements CompiledAudioCommand<ChildOutputNode, ScheduledCommand, CompiledSequence<ChildOutputNode>> {
    readonly output_node: ChildOutputNode;
    readonly sequence: AnyCompiledCommand<ChildOutputNode>[];
    readonly duration: Seconds;
    constructor(output_node: ChildOutputNode, sequence: AnyCompiledCommand<ChildOutputNode>[]);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): ScheduledCommand;
    compile(output_node: ChildOutputNode): Promise<CompiledSequence<ChildOutputNode>>;
    dispose(): void;
}
type AudioParamTransition = undefined | "exponential" | "linear";
type GainCommand = {
    transition: AudioParamTransition;
    value: number;
    when_from_start: Seconds;
};
declare class Gain<OutputNode extends AudioNode, ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<AudioNode, ChildScheduled, CompiledChild>, Child extends AudioCommand<AudioNode, ChildScheduled, CompiledChild>> implements AudioCommand<OutputNode, ScheduledCommand, CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
    readonly to_gain: Child;
    readonly gain_commands: GainCommand[];
    constructor(to_gain: Child, gain_commands: GainCommand[]);
    compile(output_node: OutputNode): Promise<CompiledGain<OutputNode, ChildScheduled, CompiledChild>>;
}
declare class CompiledGain<OutputNode extends AudioNode, ChildScheduled extends Stoppable, CompiledChild extends CompiledAudioCommand<AudioNode, ChildScheduled, CompiledChild>> implements CompiledAudioCommand<OutputNode, ScheduledCommand, CompiledGain<OutputNode, ChildScheduled, CompiledChild>> {
    readonly gain_node: GainNode;
    readonly output_node: OutputNode;
    readonly to_gain: CompiledChild;
    readonly gain_commands: GainCommand[];
    get duration(): Seconds;
    constructor(gain_node: GainNode, output_node: OutputNode, to_gain: CompiledChild, gain_commands: GainCommand[]);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(other_output_node: OutputNode): Promise<CompiledGain<OutputNode, ChildScheduled, CompiledChild>>;
    dispose(): void;
}
type CompileToOf<C> = C extends AudioCommand<any, any, infer To> ? To : never;
declare class RhythmContext {
    readonly context: AudioContext;
    constructor(context?: AudioContext);
    compile<Command extends AudioCommand<AudioDestinationNode, Stoppable, any>>(command: Command): Promise<CompileToOf<Command>>;
    get current_time(): TimeCoordinate;
}
export { type Seconds, RhythmContext, Play, CompiledPlay, Clip, CompiledClip, Repeat, CompiledRepeat, Sequence, CompiledSequence, Gain, CompiledGain };
//# sourceMappingURL=rhythm.d.ts.map