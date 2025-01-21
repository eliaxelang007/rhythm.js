
type NewType<T, Brand extends string> = T & { __brand: Brand };
type Seconds = NewType<number, "Seconds">;

interface Track {
    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void;
    cancel(time_coordinate: Seconds): void;
    get duration(): Seconds;
}

interface AudioContextualized<OutputNode extends AudioNode> {
    get context(): AudioContext;
    get output_node(): OutputNode;
}

interface Compilable<
    OutputNode extends AudioNode,
    CompileTo extends AudioCommand<OutputNode, CompileTo>
> {
    compile(context: AudioContext, output_node: OutputNode): Promise<CompileTo>;
}

interface AudioCommand<
    OutputNode extends AudioNode,
    Self extends AudioCommand<OutputNode, Self>
> extends Track,
    AudioContextualized<OutputNode>,
    Compilable<OutputNode, Self> { }

class Play<N extends AudioNode> implements Compilable<N, CompiledPlay<N>> {
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
    implements AudioCommand<OutputNode, CompiledPlay<OutputNode>> {
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

    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void {
        const player = this.context.createBufferSource();
        const players = this.players;

        players.add(player);

        player.buffer = this.buffer;
        player.onended = (_) => {
            player.disconnect();
            players.delete(player);
        };
        player.connect(this.output_node);

        player.start(time_coordinate, maybe_offset);
    }

    cancel(time_coordinate: Seconds): void {
        for (const player of this.players) {
            player.stop(time_coordinate);
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
    CompileTo extends AudioCommand<OutputNode, CompileTo>,
    Child extends Compilable<OutputNode, CompileTo>
> implements Compilable<OutputNode, CompiledClip<OutputNode, CompileTo>> {
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
    Child extends AudioCommand<OutputNode, Child>
> implements AudioCommand<OutputNode, CompiledClip<OutputNode, Child>> {
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

    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void {
        const command = this.command;
        const offset = maybe_offset ?? 0;

        command.schedule(time_coordinate, (this.offset + offset) as Seconds);
        command.cancel((time_coordinate + (this.duration - offset)) as Seconds);
    }

    cancel(time_coordinate: Seconds): void {
        this.command.cancel(time_coordinate);
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
    CompileTo extends AudioCommand<OutputNode, CompileTo>,
    Child extends Compilable<OutputNode, CompileTo>
> implements Compilable<OutputNode, CompiledRepeat<OutputNode, CompileTo>> {
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
    Child extends AudioCommand<OutputNode, Child>
> implements AudioCommand<OutputNode, CompiledRepeat<OutputNode, Child>> {
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

    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void {
        const offset = maybe_offset ?? 0;

        const command = this.command;
        const command_duration = command.duration;
        const duration = this.duration;

        let remaining_duration = (duration - offset) as Seconds;
        let repeat_offset = (offset % command_duration) as Seconds;
        let start_time = time_coordinate;

        while (remaining_duration > 0) {
            command.schedule(start_time, repeat_offset as Seconds);

            const repeat_duration = command_duration - repeat_offset;

            start_time = (start_time + repeat_duration) as Seconds;
            remaining_duration = (remaining_duration - repeat_duration) as Seconds;
            repeat_offset = 0 as Seconds;
        }

        this.cancel((time_coordinate + duration - offset) as Seconds);
    }

    cancel(time_coordinate: Seconds): void {
        this.command.cancel(time_coordinate);
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
    CompileTo extends AudioCommand<OutputNode, CompileTo>,
    Child extends Compilable<OutputNode, CompileTo>
> implements Compilable<OutputNode, CompiledSequence<OutputNode, CompileTo>> {
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
    Child extends AudioCommand<OutputNode, Child>
> implements AudioCommand<OutputNode, CompiledSequence<OutputNode, Child>> {
    readonly commands: AudioCommand<OutputNode, Child>[];
    readonly duration: Seconds;
    readonly context: AudioContext;
    readonly output_node: OutputNode;

    constructor(
        context: AudioContext,
        output_node: OutputNode,
        commands: AudioCommand<OutputNode, Child>[]
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

    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void {
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
                command.schedule(time_coordinate, offset);
                next_start_time = (time_coordinate +
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

            command.schedule(next_start_time);

            next_start_time = (next_start_time + command.duration) as Seconds;
        }
    }

    cancel(time_coordinate: Seconds): void {
        for (const command of this.commands) {
            command.cancel(time_coordinate);
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
    CompileTo extends AudioCommand<GainNode, CompileTo>,
    Child extends Compilable<GainNode, CompileTo>
> implements Compilable<OutputNode, CompiledGain<OutputNode, CompileTo>> {
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
    Child extends AudioCommand<GainNode, Child>
> implements AudioCommand<OutputNode, CompiledGain<OutputNode, Child>> {
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

    schedule(time_coordinate: Seconds, maybe_offset?: Seconds): void {
        const offset = maybe_offset ?? 0;

        this.to_gain.schedule(time_coordinate, offset as Seconds);

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

            value_changer(value, Math.max(0, (time_coordinate + when) - offset));
        }
    }

    cancel(time_coordinate: Seconds): void {
        this.to_gain.cancel(time_coordinate);
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

export {
    type Seconds,
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