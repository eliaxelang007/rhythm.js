# Rhythm.js!

## Description
[rhythm.js](https://github.com/eliaxelang007/rhythm.js) is a relatively thin wrapper around the Web AudioAPI that (hopefully) makes interacting with it a lot more intuitive!

The whole library is built around the concepts of **Audio Commands** and **Compiled Audio Commands**. <br/>
You can **nest audio commands inside other audio commands** to get more complex behavior! <br/>
And, you can treat **Compiled Audio Commands** just like uncompiled ones!

It's like Google's **Flutter** but for audio manipulation.

Find it on [npm](https://www.npmjs.com/package/rhythm.js) and [GitHub](https://github.com/eliaxelang007/rhythm.js)!

## Documentation

### Quickstart

* Clone the [repo](https://github.com/eliaxelang007/rhythm.js): `git clone https://github.com/eliaxelang007/rhythm.js.git`
* Install with [npm](https://www.npmjs.com/package/rhythm.js): `npm install rhythm.js`
* CDN using jsDelivr 
  * `<script src="https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.js"></script>` <br/> (You'll have to prefix your imports with `Rhythm.`)
  * `import { /* Imports */ } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";`

### Commands

Here's a list of the currently available audio commands.

| AudioCommand | Description |
| --- | --- |
| `Play(path: string)` | The most basic audio command. Plays the audio file specified in `path`! |
| `Clip(to_clip: AudioCommand, duration: Seconds, offset: Seconds = 0)` | Creates a clip of its child command starting at `offset` and playing from there for `duration`. |
| `Repeat(to_repeat: AudioCommand, duration: Seconds)` | Repeats its child command until it fits into `duration`. |
| `Sequence(sequence: AudioCommand[])` | Plays each command in `sequence` one after the other. |
| `Gain(to_gain: AudioCommand, gain_keyframes: GainKeyframe[]) ` | Plays its child command normally but `gain_keyframes` lets you control how the volume will change over time! |

### General Usage

First make a command,

```typescript
const some_command = new Repeat(
    new Clip(
        new Play("example.mp3"), 
        10, // Play 10 seconds 
        5   // starting 5 seconds into my child command.
    ), 
    20 // Repeat my child command for 20 seconds.
);
```

compile it,

```typescript
const rhythm = new RhythmContext(/* new AudioContext() [You can optionally provide an AudioContext] */);
const track = await rhythm.compile(some_command);
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

Each time you call play, it gives you a handle to the scheduled instance of the track. `schedule_stop` works just like [`AudioScheduledSourceNode.stop`](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/stop).

```typescript
const now = rhythm.current_time;
const scheduled = track.schedule_play(now);

scheduled.schedule_stop(now + 2); // Stops the track 2 seconds after it starts.
```

You can also determine how far the current time is from when you scheduled a play with `time_from_start`.

```typescript
const scheduled = track.schedule_play();

// Wait 2 seconds...

schedule.time_from_start() // Should return 2.
```
> `time_from_start` can return negative values if you call it before the start time you specified in `schedule_play`

---

Once a command is compiled, you have access to its duration.

```typescript
track.duration
```

That's useful because you can ***treat compiled audio commands just like uncompiled audio commands*** which is one of the core tenets of rhythm.js.

You can see an example of this in the code snippet below.

```typescript
const track = await rhythm.compile(new Play("example.mp3"));

const new_track = await rhythm.compile(
  new Repeat(
    track,
    track.duration * 2 // Repeat the track twice.
  )
);
```
> Loading audio tracks happens in the compilation stage, and since the `Play` inside `track` has already been compiled, the second `await rhythm.compile` here runs almost instantly!

You can get a lot more complex with this tenet, try it out!

---

If you want to be extra tidy, you can call the `dispose` method to cleanup the used Web Audio API resources.

```typescript
const track = await rhythm.compile(new Play("example.mp3"));
track.dispose();
```
> Silently waiting on [`proposal-explicit-resource-management`](https://github.com/tc39/proposal-explicit-resource-management)!

## Examples

We'll be using `./celery_in_a_carrot_field.ogg` as our example track's filepath.

### Play

To play a track with rhythm.js, try this!

```typescript
import { RhythmContext, Play } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";

async function play() {
    const command = new Play("./celery_in_a_carrot_field.ogg");

    const rhythm = new RhythmContext();
    const track = await rhythm.compile(command);

    track.schedule_play();
}

play();
```

### Clip

To create a clip of a certain section of a track, do this!

In this code snippet, `Clip` will create a track that starts 5 seconds 
into its child node, `Play`, and then plays its next 10 seconds.

```typescript
import { RhythmContext, Play, Clip } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";

async function play() {
    const clip_duration_seconds = 10;
    const start_at_seconds = 5;

    const command = new Clip(
        new Play("./celery_in_a_carrot_field.ogg"),
        clip_duration_seconds,
        start_at_seconds
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile(command);

    track.schedule_play();
}

play();
```

### Repeat

To repeat a track, do this!
In this code snippet, once the `Repeat` node is scheduled to play, <br/> it will keep repeating the `Clip` node inside it while it hasn't been 20 seconds yet.

```typescript
import { RhythmContext, Play, Clip, Repeat } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";

async function play() {
    const clip_duration_seconds = 10;
    const start_at_seconds = 5;

    const repeat_duration_seconds = 20;

    const command = new Repeat(
        new Clip(
            new Play("./celery_in_a_carrot_field.ogg"),
            clip_duration_seconds,
            start_at_seconds
        ),
        repeat_duration_seconds
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile(command);

    track.schedule_play();
}

play();
```

### Sequence

To play tracks one after the other, do this!
`Sequence` will play the `Clip` inside of it first, and when it ends will play the `Repeat` inside it next.

```typescript
import { RhythmContext, Play, Clip, Repeat, Sequence } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";

async function play() {
    const song = new Play("./celery_in_a_carrot_field.ogg");

    const command = new Sequence(
        [
            new Clip(song, 10, 5),
            new Repeat(song, 10)
        ]
    );

    const rhythm = new RhythmContext();
    const track = await rhythm.compile(command);

    track.schedule_play();
}

play();
```

### Gain

To change the volume of a track throughout its playback, try this!
`Gain` here adds a 5 second exponential fade in and fade out to the track.

```typescript
import { RhythmContext, Play, Gain } from "https://cdn.jsdelivr.net/npm/rhythm.js@latest/dist/rhythm.esm.js";

async function play() {
    const song = new Play("./celery_in_a_carrot_field.ogg");

    const rhythm = new RhythmContext();
    const compiled_song = await rhythm.compile(song);

    const faded_song = await rhythm.compile(
        new Gain(
            compiled_song, // You could very well put any other Audio Command here. It doesn't have to be compiled.
            [
                {
                    value: 0.01, // Can't exponentially fade in from a flat 0.
                    from_start: 0
                },
                {
                    transition: "exponential",
                    value: 1,
                    from_start: 20
                },
                {
                    value: 1,
                    from_start: compiled_song.duration - 20
                },
                {
                    transition: "exponential",
                    value: 0.01, // Can't exponentially fade out to a flat 0.
                    from_start: compiled_song.duration
                }
            ]
        )
    );

    faded_song.schedule_play();
}

play();
```

This is what the type of `GainKeyframe` look like!

```typescript
type GainKeyframe = {
    transition: undefined | "exponential" | "linear"; // How the gain node should transition to its target [value] from the previous [GainKeyframe].
    value: number;                                    // The target value of the gain node.
    from_start: Seconds;                              // The time relative to the start of the track when the gain's value should be the target [value].
};
```

# Credits
Sample music in tests from [StarryAttic](https://www.youtube.com/watch?v=FqI9cM6fczU) on Youtube!