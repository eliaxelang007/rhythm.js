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
interface AudioCommand<CompileTo extends CompiledAudioCommand> {
    compile(output_node: AudioNode): Promise<CompileTo>;
}
interface CompiledAudioCommand extends Playable, Outputter, AudioCommand<CompiledAudioCommand> {
}
type AnyCommand = AudioCommand<CompiledAudioCommand>;
declare class Play implements AudioCommand<CompiledPlay> {
    readonly path: string;
    constructor(path: string);
    compile(output_node: AudioNode): Promise<CompiledPlay>;
}
declare class CompiledPlay implements CompiledAudioCommand {
    readonly output_node: AudioNode;
    readonly buffer: AudioBuffer;
    readonly duration: Seconds;
    constructor(output_node: AudioNode, buffer: AudioBuffer);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledPlay>;
}
declare class Clip implements AudioCommand<CompiledClip> {
    readonly to_clip: AnyCommand;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: AnyCommand, duration: Seconds, offset?: Seconds);
    compile(output_node: AudioNode): Promise<CompiledClip>;
}
declare class CompiledClip implements CompiledAudioCommand {
    readonly to_clip: CompiledAudioCommand;
    readonly duration: Seconds;
    readonly offset: Seconds;
    constructor(to_clip: CompiledAudioCommand, duration: Seconds, offset?: Seconds);
    get output_node(): AudioNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledClip>;
}
declare class Repeat implements AudioCommand<CompiledRepeat> {
    readonly to_repeat: AnyCommand;
    readonly duration: Seconds;
    constructor(to_repeat: AnyCommand, duration: Seconds);
    compile(output_node: AudioNode): Promise<CompiledRepeat>;
}
declare class CompiledRepeat implements CompiledAudioCommand {
    readonly to_repeat: CompiledAudioCommand;
    readonly duration: Seconds;
    constructor(to_repeat: CompiledAudioCommand, duration: Seconds);
    get output_node(): AudioNode;
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledRepeat>;
}
declare class Sequence implements AudioCommand<CompiledSequence> {
    readonly sequence: AnyCommand[];
    constructor(sequence: AnyCommand[]);
    compile(output_node: AudioNode): Promise<CompiledSequence>;
}
declare class CompiledSequence implements CompiledAudioCommand {
    readonly output_node: AudioNode;
    readonly sequence: CompiledAudioCommand[];
    readonly duration: Seconds;
    constructor(output_node: AudioNode, sequence: CompiledAudioCommand[]);
    schedule_play(play_at?: TimeCoordinate, maybe_offset?: Seconds): Stoppable;
    compile(output_node: AudioNode): Promise<CompiledSequence>;
}
type AudioParamTransition = undefined | "exponential" | "linear";
type GainCommand = {
    transition: AudioParamTransition;
    value: number;
    when_from_start: Seconds;
};
declare class Gain implements AudioCommand<CompiledGain> {
    readonly to_gain: AnyCommand;
    readonly gain_commands: GainCommand[];
    constructor(to_gain: AnyCommand, gain_commands: GainCommand[]);
    compile(output_node: AudioNode): Promise<CompiledGain>;
}
declare class CompiledGain implements CompiledAudioCommand {
    readonly gain_node: GainNode;
    readonly output_node: AudioNode;
    readonly to_gain: CompiledAudioCommand;
    readonly gain_commands: GainCommand[];
    get duration(): Seconds;
    constructor(gain_node: GainNode, output_node: AudioNode, to_gain: CompiledAudioCommand, gain_commands: GainCommand[]);
    schedule_play(play_at?: Seconds, maybe_offset?: Seconds): Stoppable;
    compile(other_output_node: AudioNode): Promise<CompiledGain>;
}
declare class RhythmContext {
    readonly context: AudioContext;
    constructor(context?: AudioContext);
    compile(command: AnyCommand): Promise<CompiledAudioCommand>;
    get current_time(): TimeCoordinate;
}
export { type Seconds, RhythmContext, Play, CompiledPlay, Clip, CompiledClip, Repeat, CompiledRepeat, Sequence, CompiledSequence, Gain, CompiledGain };
//# sourceMappingURL=rhythm.d.ts.map