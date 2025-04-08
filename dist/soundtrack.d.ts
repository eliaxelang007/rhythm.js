type NewType<T> = T & {
    readonly __brand: unique symbol;
};
type Seconds = NewType<number>;
type TimeCoordinate = NewType<Seconds>;
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
interface AudioCommand<CompileTo extends CompiledAudioCommand<CompileTo>> {
    compile(output_node: AudioNode): Promise<CompileTo>;
}
interface CompiledAudioCommand<Self extends CompiledAudioCommand<Self>> extends Playable, Outputter, AudioCommand<Self> {
}
declare class Play implements AudioCommand<CompiledPlay> {
    readonly path: string;
    constructor(path: string);
    compile(output_node: AudioNode): Promise<CompiledPlay>;
}
declare class CompiledPlay implements CompiledAudioCommand<CompiledPlay> {
    readonly output_node: AudioNode;
    readonly buffer: AudioBuffer;
    readonly duration: Seconds;
    constructor(output_node: AudioNode, buffer: AudioBuffer);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledPlay>;
}
declare class Clip<ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>, Child extends AudioCommand<ChildCompileTo>> implements AudioCommand<CompiledClip<ChildCompileTo>> {
    readonly to_clip: Child;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: Child, duration: Seconds, offset?: Seconds);
    compile(output_node: AudioNode): Promise<CompiledClip<ChildCompileTo>>;
}
declare class CompiledClip<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledClip<CompiledChild>> {
    readonly to_clip: CompiledChild;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: CompiledChild, duration: Seconds, offset?: Seconds);
    get output_node(): AudioNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledClip<CompiledChild>>;
}
declare class Repeat<ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>, Child extends AudioCommand<ChildCompileTo>> implements AudioCommand<CompiledRepeat<ChildCompileTo>> {
    readonly to_repeat: Child;
    readonly duration: Seconds;
    constructor(to_repeat: Child, duration: Seconds);
    compile(output_node: AudioNode): Promise<CompiledRepeat<ChildCompileTo>>;
}
declare class CompiledRepeat<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledRepeat<CompiledChild>> {
    readonly to_repeat: CompiledChild;
    readonly duration: Seconds;
    constructor(to_repeat: CompiledChild, duration: Seconds);
    get output_node(): AudioNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledRepeat<CompiledChild>>;
}
type AnyCompiledCommand = CompiledAudioCommand<any>;
type AnyCommand = AudioCommand<AnyCompiledCommand>;
declare class Sequence implements AudioCommand<CompiledSequence> {
    readonly sequence: AnyCommand[];
    constructor(sequence: AnyCommand[]);
    compile(output_node: AudioNode): Promise<CompiledSequence>;
}
declare class CompiledSequence implements CompiledAudioCommand<CompiledSequence> {
    readonly output_node: AudioNode;
    readonly sequence: AnyCompiledCommand[];
    readonly duration: Seconds;
    constructor(output_node: AudioNode, sequence: AnyCompiledCommand[]);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledSequence>;
}
type AudioParamTransition = undefined | "exponential" | "linear";
type GainCommand = {
    transition: AudioParamTransition;
    value: number;
    when_from_start: Seconds;
};
declare class Gain<ChildCompileTo extends CompiledAudioCommand<ChildCompileTo>, Child extends AudioCommand<ChildCompileTo>> implements AudioCommand<CompiledGain<ChildCompileTo>> {
    readonly to_gain: Child;
    readonly gain_commands: GainCommand[];
    constructor(to_gain: Child, gain_commands: GainCommand[]);
    compile(output_node: AudioNode): Promise<CompiledGain<ChildCompileTo>>;
}
declare class CompiledGain<CompiledChild extends CompiledAudioCommand<CompiledChild>> implements CompiledAudioCommand<CompiledGain<CompiledChild>> {
    readonly gain_node: GainNode;
    readonly output_node: AudioNode;
    readonly to_gain: CompiledChild;
    readonly gain_commands: GainCommand[];
    get duration(): Seconds;
    constructor(gain_node: GainNode, output_node: AudioNode, to_gain: CompiledChild, gain_commands: GainCommand[]);
    schedule_play(play_at?: Seconds, maybe_offset?: Seconds): Stoppable;
    compile(other_output_node: AudioNode): Promise<CompiledGain<CompiledChild>>;
}
declare class SoundtrackContext {
    readonly context: AudioContext;
    constructor(context?: AudioContext);
    load<CompileTo extends CompiledAudioCommand<CompileTo>, Command extends AudioCommand<CompileTo>>(command: Command): Promise<CompileTo>;
    get current_time(): TimeCoordinate;
}
export { type Seconds, SoundtrackContext, Play, CompiledPlay, Clip, CompiledClip, Repeat, CompiledRepeat, Sequence, CompiledSequence, Gain, CompiledGain };
//# sourceMappingURL=soundtrack.d.ts.map