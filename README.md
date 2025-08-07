# Rhythm.js

# [Live Demo](https://eliaxelang007.github.io/rhythm.js/examples/all.html)!

## Description
[rhythm.js](https://github.com/eliaxelang007/rhythm.js) is a relatively thin wrapper around the Web AudioAPI that (hopefully) makes interacting with it a lot more intuitive.

The whole library is built around the concepts of **Audio Commands** and **Compiled Audio Commands**. <br/>
You can **nest audio commands inside other audio commands** to get more complex behavior. <br/>
And, you can treat **Compiled Audio Commands** just like uncompiled ones!

It's like a declarative UI framework, but for audio.

> Find Rhythm.js on [npm](https://www.npmjs.com/package/rhythm.js) and [GitHub](https://github.com/eliaxelang007/rhythm.js).

## Documentation

### Quickstart

* Clone the [repo](https://github.com/eliaxelang007/rhythm.js): `git clone https://github.com/eliaxelang007/rhythm.js.git`
* Install with [npm](https://www.npmjs.com/package/rhythm.js): `npm install rhythm.js`
* CDN using jsDelivr 
  * `<script src="https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7dist/rhythm.js"></script>` <br/> (You'll have to prefix your imports with `Rhythm.`)
  * `import { /* Imports */ } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";`

#### The CDN may not update instantly once the latest version is released.

### Commands

Here's a list of the currently available audio commands.

| AudioCommand | Description |
| --- | --- |
| `Play(path: string)` | The most basic audio command. Plays the audio file specified in `path`. |
| `Clip({ offset: Seconds, duration: Seconds }, child: AudioCommand)` | Creates a clip of its `child` command starting at `offset` and playing from there for `duration`. |
| `Repeat({ duration: Seconds }, child: AudioCommand)` | Repeats its `child` command until it fits into `duration`. |
| `Sequence(children: AudioCommand[])` | Plays each command in `children` one after the other. |
| `Gain({ gain_keyframes: GainKeyframe[] }, child: AudioCommand) ` | Plays its `child` command while letting `gain_keyframes` control how the volume will change over time. |

### General Usage

First make a command,

```typescript
const some_command = new Repeat(
    {
        duration: 20 // Repeat my child command for 20 seconds.
    },
    new Clip(
        {
            offset: 5, // Starting 5 seconds into my child command,
            duration: 10 // play 10 seconds.
        },
        new Play("example.mp3"), 
    )
);
```

compile and attach it,

```typescript
const rhythm = new RhythmContext(/* new AudioContext() [You can optionally provide an AudioContext] */);
const track = await rhythm.compile_attached(some_command);
```

and then, finally, play it!

```typescript
track.schedule_play();
```

`schedule_play` works just like [`AudioBufferSourceNode.start`](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start), but you can call it multiple times, and it doesn't have the third `duration` parameter.

```typescript
// Starts the track 1 second from now with playback beginning at 3 seconds into the track.
track.schedule_play(rhythm.current_time + 1, 3); 
```

> `rhythm.current_time` is an alias for the `currentTime` of the `RhythmContext`'s inner `AudioContext`.

Each time you call play, it gives you a handle to the scheduled instance of the track. On the handle, `schedule_stop` works just like [`AudioScheduledSourceNode.stop`](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/stop).

```typescript
const now = rhythm.current_time;
const scheduled = track.schedule_play(now);

scheduled.schedule_stop(now + 2); // Stops the track 2 seconds after it starts.
```

The handle also has `start_time` and `end_time` which stores when the command is scheduled for.

```typescript
const start_at = rhythm.current_time + 1;
const offset = 3;

// Starts the track 1 second from now with playback beginning at 3 seconds into the track.
const scheduled = track.schedule_play(start_at, offset);

scheduled.start_time // Will be equal to [start_at]
scheduled.end_time // Will be equal to [start_at + (track.duration - offset)] 
```
---

Once a command is compiled, you have access to its duration.

```typescript
track.duration
```

That's useful because you can ***treat compiled audio commands just like uncompiled audio commands*** which is one of the core tenets of rhythm.js.

You can see an example of this in the code snippet below.

```typescript
const track = await rhythm.compile(new Play("example.mp3"));

const played_twice = await rhythm.compile_attached(
  new Repeat(
    {
        duration: track.duration * 2 // This makes the [track] play twice.
    },
    track
  )
);

played_twice.scheduled_play();
```
> Loading audio tracks happens in the compilation stage, and since the `Play` inside `track` has already been compiled, `await rhythm.compile_attached` here runs almost instantly!

You can get a lot more complex with this tenet, try it out!

### RhythmContext

Here's what the methods of `RhythmContext` do.

| Compilation Method | Description |
| --- | --- |
| `compile(command: AudioCommand)` | Compiles your `AudioCommand` into a form where you have to supply an `AudioNode` `output_node` as the first argument every time you call `scheduled_play`. |
| `attach(command: CompiledAudioCommand)` | Once attached to the `RhythmContext`, the `destination` node of the `RhythmContext`'s inner `AudioContext` is always implicitly supplied as the first argument in the compiled command's `scheduled_play`, allowing you to call the method without passing an `output_node` in. |
| `compile_attached(command: AudioCommand)` | Equivalent to `this.attach(await this.compile(command))` |
> Attached compiled commands can be detached using their `detach` methods, making their `scheduled_play` methods have to be called with an explicit `output_node` as their first parameter again.

### `onended` Callbacks

If you want to run some code once a track has completed playing, do this.

```typescript
const scheduled = track.schedule_play();

scheduled.add_on_stop_listener((event) => { /* Code to run when the track has finished playing. */ });
```

### Advanced

If you'd like, you can read through the only 500 lines of code that make up this library. That way, you'll gain a fuller grasp of its inner workings.
> I've tried to cover all the features comprehensively in this readme though, but still feel free to peek around!

## Examples

We'll be using `./celery_in_a_carrot_field.ogg` as our example track's filepath.
> See an example live [here](https://eliaxelang007.github.io/rhythm.js/)!

### Play

To play a track with rhythm.js, try this.

```typescript
import { RhythmContext, Play } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";

async function play() {
    const command = new Play("./celery_in_a_carrot_field.ogg");

    const rhythm = new RhythmContext();
    const track = await rhythm.compile_attached(command);

    track.schedule_play();
}

play();
```

### Clip

To create a clip of a certain section of a track, do this.

In this code snippet, `Clip` will create a track that starts 5 seconds 
into its child node, `Play`, and then plays its next 10 seconds.

```typescript
import { RhythmContext, Play, Clip } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";

async function play() {
    const command = new Clip(
        {
            offset: 5,
            duration: 10
        },
        new Play("./celery_in_a_carrot_field.ogg")
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile_attached(command);

    track.schedule_play();
}

play();
```

### Repeat

To repeat a track, do this.
In this code snippet, once the `Repeat` node is scheduled to play, <br/> it will keep repeating the `Clip` node inside it while it hasn't been 20 seconds yet, in effect making the `Clip` play twice.

```typescript
import { RhythmContext, Play, Clip, Repeat } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";

async function play() {
    const command = new Repeat(
        {
            duration: 20
        },
        new Clip(
            {
                offset: 5,
                duration: 10
            },
            new Play("./celery_in_a_carrot_field.ogg")
        )
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile_attached(command);

    track.schedule_play();
}

play();
```

### Sequence

To play tracks one after the other, do this.
Here, `Sequence` will play the `Clip` inside of it first, and when it ends will play the `Repeat` inside it next.

```typescript
import { RhythmContext, Play, Clip, Repeat, Sequence } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";

async function play() {
    const song = new Play("./celery_in_a_carrot_field.ogg");

    const command = new Sequence(
        [
            new Clip(
                {
                    offset: 5,
                    duration: 10
                },
                song
            ),
            new Repeat(
                {
                    duration: 10
                },
                song
            )
        ]
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile_attached(command);

    track.schedule_play();
}

play();
```

### Gain

To change the volume of a track throughout its playback, try this.
`Gain` here adds a 20 second exponential fade in and fade out to the track.

```typescript
import { RhythmContext, Play, Gain } from "https://cdn.jsdelivr.net/npm/rhythm.js@1.1.7/dist/rhythm.esm.js";

async function play() {
    const rhythm = new RhythmContext();
    const compiled_song = await rhythm.compile( // See [RhythmContext] section of the readme.
        new Play("./celery_in_a_carrot_field.ogg")
    ); 

    const fade_duration_seconds = 20;

    const faded_song = await rhythm.compile_attached(
        new Gain(
            {
                gain_keyframes: [
                    {
                        value: 0.01, // Can't exponentially fade in from a flat 0.
                        from_start: 0
                    },
                    {
                        transition: "exponential",
                        value: 1,
                        from_start: fade_duration_seconds
                    },
                    {
                        value: 1,
                        from_start: compiled_song.duration - fade_duration_seconds // I only compiled the song to be able to access its duration.
                    },
                    {
                        transition: "exponential",
                        value: 0.01, // Can't exponentially fade out to a flat 0.
                        from_start: compiled_song.duration
                    }
                ]
            },
            compiled_song, // You could very well put any other Audio Command here. It doesn't have to be compiled.
        )
    );

    faded_song.schedule_play();
}

play();
```

This is what the type of `GainKeyframe` look like.

```typescript
type GainKeyframe = {
    transition: undefined | "exponential" | "linear"; // How the gain node should transition to its target [value] from the previous [GainKeyframe].
    value: number;                                    // The target value of the gain node.
    from_start: Seconds;                              // The time relative to the start of the track when the gain's value should be the target [value].
};
```

## Credits
If you encounter any bugs or see any issues with this library, don't hesitate to file an [issue/suggestion](https://github.com/eliaxelang007/rhythm.js/issues) or [pull request](https://github.com/eliaxelang007/rhythm.js/pulls) on [GitHub](https://github.com/eliaxelang007/rhythm.js)!

The API is still constantly changing, so it's not production ready. (Yet!)

Sample music in tests from [StarryAttic](https://www.youtube.com/watch?v=FqI9cM6fczU) on Youtube.