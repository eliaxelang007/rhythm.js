
type NewType<T, Brand extends string> = T & { __brand: Brand };
type Seconds = NewType<number, "Seconds">;

interface Track {
    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void;
    stop(maybe_wait?: Seconds): void;
    get duration(): Seconds;
}

interface AudioContextualized<OutputNode extends AudioNode> {
    get context(): AudioContext;
    get output_node(): OutputNode;
}

interface AudioCommand<
    OutputNode extends AudioNode,
    CompileTo extends CompiledAudioCommand<OutputNode, CompileTo>
> {
    compile(context: AudioContext, output_node: OutputNode): Promise<CompileTo>;
}

interface CompiledAudioCommand<
    OutputNode extends AudioNode,
    Self extends CompiledAudioCommand<OutputNode, Self>
> extends Track,
    AudioContextualized<OutputNode>,
    AudioCommand<OutputNode, Self> { }

class Play<N extends AudioNode> implements AudioCommand<N, CompiledPlay<N>> {
    readonly path: string;

    constructor(path: string) {
        this.path = path;
    }

    async compile(
        context: AudioContext,
        output_node: N
    ): Promise<CompiledPlay<N>> {
        const response = await fetch(this.path);
        const array_buffer = await response.arrayBuffer();

        const audio_buffer = await context.decodeAudioData(array_buffer);

        return new CompiledPlay(context, output_node, audio_buffer);
    }
}

class CompiledPlay<OutputNode extends AudioNode>
    implements CompiledAudioCommand<OutputNode, CompiledPlay<OutputNode>> {
    readonly context: AudioContext;
    readonly output_node: OutputNode;

    readonly players: Set<AudioBufferSourceNode>;

    readonly buffer: AudioBuffer;
    readonly duration: Seconds;

    constructor(
        context: AudioContext,
        output_node: OutputNode,
        buffer: AudioBuffer
    ) {
        this.context = context;
        this.output_node = output_node;
        this.buffer = buffer;
        this.duration = buffer.duration as Seconds;
        this.players = new Set();
    }

    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void {
        const player = this.context.createBufferSource();
        const players = this.players;

        players.add(player);

        player.buffer = this.buffer;
        player.onended = (_) => {
            player.disconnect();
            players.delete(player);
        };
        player.connect(this.output_node);

        player.start(this.context.currentTime + (maybe_wait ?? 0), maybe_offset);
    }

    stop(maybe_wait?: Seconds): void {
        const wait = this.context.currentTime + (maybe_wait ?? 0);

        for (const player of this.players) {
            player.stop(wait);
        }
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledPlay<OutputNode>> {
        if (this.context === context && this.output_node === output_node) {
            return this;
        }

        return new CompiledPlay(context, output_node, this.buffer);
    }
}

class Clip<
    OutputNode extends AudioNode,
    CompileTo extends CompiledAudioCommand<OutputNode, CompileTo>,
    Child extends AudioCommand<OutputNode, CompileTo>
> implements AudioCommand<OutputNode, CompiledClip<OutputNode, CompileTo>> {
    readonly to_clip: Child;
    readonly offset: Seconds;
    readonly duration: Seconds;

    constructor(to_clip: Child, offset: Seconds, duration: Seconds) {
        this.to_clip = to_clip;
        this.offset = offset;
        this.duration = duration;
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledClip<OutputNode, CompileTo>> {
        return new CompiledClip(
            await this.to_clip.compile(context, output_node),
            this.offset,
            this.duration
        );
    }
}

class CompiledClip<
    OutputNode extends AudioNode,
    Child extends CompiledAudioCommand<OutputNode, Child>
> implements CompiledAudioCommand<OutputNode, CompiledClip<OutputNode, Child>> {
    readonly command: Child;
    readonly offset: Seconds;
    readonly duration: Seconds;

    constructor(command: Child, offset: Seconds, duration: Seconds) {
        this.command = command;
        this.offset = offset;
        this.duration = duration;
    }

    get context(): AudioContext {
        return this.command.context;
    }

    get output_node(): OutputNode {
        return this.command.output_node;
    }

    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void {
        const wait = maybe_wait ?? 0 as Seconds;
        const offset = maybe_offset ?? 0;

        const command = this.command;

        command.play(wait, (this.offset + offset) as Seconds);
        command.stop((wait + (this.duration - offset)) as Seconds);
    }

    stop(maybe_wait?: Seconds): void {
        this.command.stop(maybe_wait);
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledClip<OutputNode, Child>> {
        if (this.context === context && this.output_node === output_node) {
            return this;
        }

        return new CompiledClip(
            await this.command.compile(context, output_node),
            this.offset,
            this.duration
        );
    }
}

class Repeat<
    OutputNode extends AudioNode,
    CompileTo extends CompiledAudioCommand<OutputNode, CompileTo>,
    Child extends AudioCommand<OutputNode, CompileTo>
> implements AudioCommand<OutputNode, CompiledRepeat<OutputNode, CompileTo>> {
    readonly to_repeat: Child;
    readonly duration: Seconds;

    constructor(to_repeat: Child, duration: Seconds) {
        this.to_repeat = to_repeat;
        this.duration = duration;
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledRepeat<OutputNode, CompileTo>> {
        return new CompiledRepeat(
            await this.to_repeat.compile(context, output_node),
            this.duration
        );
    }
}

class CompiledRepeat<
    OutputNode extends AudioNode,
    Child extends CompiledAudioCommand<OutputNode, Child>
> implements CompiledAudioCommand<OutputNode, CompiledRepeat<OutputNode, Child>> {
    readonly command: Child;
    readonly duration: Seconds;

    constructor(command: Child, duration: Seconds) {
        this.command = command;
        this.duration = duration;
    }

    get context(): AudioContext {
        return this.command.context;
    }

    get output_node(): OutputNode {
        return this.command.output_node;
    }

    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void {
        const wait = maybe_wait ?? 0 as Seconds;
        const offset = maybe_offset ?? 0;

        const command = this.command;
        const command_duration = command.duration;
        const duration = this.duration;

        let remaining_duration = (duration - offset) as Seconds;
        let repeat_offset = (offset % command_duration) as Seconds;
        let start_time = wait;

        while (remaining_duration > 0) {
            command.play(start_time, repeat_offset as Seconds);

            const repeat_duration = command_duration - repeat_offset;

            start_time = (start_time + repeat_duration) as Seconds;
            remaining_duration = (remaining_duration - repeat_duration) as Seconds;
            repeat_offset = 0 as Seconds;
        }

        this.stop(wait + (duration - offset) as Seconds);
    }

    stop(maybe_wait?: Seconds): void {
        this.command.stop(maybe_wait);
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledRepeat<OutputNode, Child>> {
        if (this.context === context && this.output_node === output_node) {
            return this;
        }

        return new CompiledRepeat(
            await this.command.compile(context, output_node),
            this.duration
        );
    }
}

class Sequence<
    OutputNode extends AudioNode,
    CompileTo extends CompiledAudioCommand<OutputNode, CompileTo>,
    Child extends AudioCommand<OutputNode, CompileTo>
> implements AudioCommand<OutputNode, CompiledSequence<OutputNode, CompileTo>> {
    readonly sequence: Child[];

    constructor(sequence: Child[]) {
        this.sequence = sequence;
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledSequence<OutputNode, CompileTo>> {
        return new CompiledSequence(
            context,
            output_node,
            await Promise.all(
                this.sequence.map((compilable) =>
                    compilable.compile(context, output_node)
                )
            )
        );
    }
}

class CompiledSequence<
    OutputNode extends AudioNode,
    Child extends CompiledAudioCommand<OutputNode, Child>
> implements CompiledAudioCommand<OutputNode, CompiledSequence<OutputNode, Child>> {
    readonly commands: CompiledAudioCommand<OutputNode, Child>[];
    readonly duration: Seconds;
    readonly context: AudioContext;
    readonly output_node: OutputNode;

    constructor(
        context: AudioContext,
        output_node: OutputNode,
        commands: CompiledAudioCommand<OutputNode, Child>[]
    ) {
        this.context = context;
        this.output_node = output_node;

        this.commands = commands;
        this.duration = commands
            .map((command) => command.duration)
            .reduce(
                (total_duration, duration) => total_duration + duration,
                0
            ) as Seconds;
    }

    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void {
        let wait = maybe_wait ?? 0 as Seconds;
        let offset = (maybe_offset ?? 0) as Seconds;

        const iterator = this.commands.values();

        let next_start_time = 0 as Seconds;

        while (true) {
            const { value: command, done } = iterator.next();

            if (done) {
                break;
            }

            const command_duration = command.duration;

            if (offset < command_duration) {
                command.play(wait, offset);
                next_start_time = (wait +
                    (command_duration - offset)) as Seconds;
                break;
            }

            offset = (offset - command_duration) as Seconds;
        }

        while (true) {
            const { value: command, done } = iterator.next();

            if (done) {
                break;
            }

            command.play(next_start_time);

            next_start_time = (next_start_time + command.duration) as Seconds;
        }
    }

    stop(maybe_wait?: Seconds): void {
        for (const command of this.commands) {
            command.stop(maybe_wait);
        }
    }

    async compile(
        context: AudioContext,
        output_node: OutputNode
    ): Promise<CompiledSequence<OutputNode, Child>> {
        if (this.context === context && this.output_node === output_node) {
            return this;
        }

        return new CompiledSequence(
            this.context,
            this.output_node,
            await Promise.all(
                this.commands.map((command) => command.compile(context, output_node))
            )
        );
    }
}

type AudioParamTransition = undefined | "exponential" | "linear";

type GainCommand = {
    transition?: AudioParamTransition;
    value: number;
    when: Seconds;
};

class Gain<
    OutputNode extends AudioNode,
    CompileTo extends CompiledAudioCommand<GainNode, CompileTo>,
    Child extends AudioCommand<GainNode, CompileTo>
> implements AudioCommand<OutputNode, CompiledGain<OutputNode, CompileTo>> {
    readonly command: Child;
    readonly gain_commands: GainCommand[];

    constructor(command: Child, gain_commands: GainCommand[]) {
        this.command = command;
        this.gain_commands = gain_commands;
    }

    async compile(context: AudioContext, output_node: OutputNode): Promise<CompiledGain<OutputNode, CompileTo>> {
        const gain_node = context.createGain();
        gain_node.connect(output_node);

        return new CompiledGain(
            gain_node,
            output_node,
            await this.command.compile(context, gain_node),
            this.gain_commands
        );
    }
}

class CompiledGain<
    OutputNode extends AudioNode,
    Child extends CompiledAudioCommand<GainNode, Child>
> implements CompiledAudioCommand<OutputNode, CompiledGain<OutputNode, Child>> {
    readonly gain_node: GainNode;
    readonly to_gain: Child;
    readonly gain_commands: GainCommand[];
    readonly output_node: OutputNode;

    get duration(): Seconds {
        return this.to_gain.duration;
    }

    get context(): AudioContext {
        return this.to_gain.context;
    }

    constructor(gain_node: GainNode, output_node: OutputNode, to_gain: Child, gain_commands: GainCommand[]) {
        this.gain_node = gain_node;
        this.to_gain = to_gain;
        this.output_node = output_node;
        this.gain_commands = gain_commands;
    }

    play(maybe_wait?: Seconds, maybe_offset?: Seconds): void {
        const wait = maybe_wait ?? 0 as Seconds;
        const offset = maybe_offset ?? 0;

        this.to_gain.play(wait, offset as Seconds);

        const gain = this.gain_node.gain;

        for (const { transition, value, when } of this.gain_commands) {
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

            value_changer(value, Math.max(0, ((wait ?? 0) + when) - offset));
        }
    }

    stop(maybe_wait?: Seconds): void {
        this.to_gain.stop(maybe_wait);
    }

    async compile(context: AudioContext, output_node: OutputNode): Promise<CompiledGain<OutputNode, Child>> {
        if (this.context === context && this.output_node === output_node) {
            return this;
        }

        const gain_node = context.createGain();
        gain_node.connect(output_node);

        return new CompiledGain(
            gain_node,
            output_node,
            await this.to_gain.compile(context, gain_node),
            this.gain_commands
        );
    }
}

class Player {
    readonly context: AudioContext;

    constructor(context?: AudioContext) {
        this.context = context ?? new AudioContext();
    }

    load<
        CompileTo extends CompiledAudioCommand<AudioDestinationNode, CompileTo>,
        Command extends AudioCommand<AudioDestinationNode, CompileTo>
    >(command: Command): Promise<CompileTo> {
        const context = this.context;
        return command.compile(context, context.destination);
    }
}

export {
    type Seconds,
    Player,
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