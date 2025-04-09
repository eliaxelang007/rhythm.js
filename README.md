# Rhythm.js!

## Description
[rhythm.js](https://github.com/eliaxelang007/rhythm.js/tree/main) is a relatively thin wrapper around the Web AudioAPI that (hopefully) makes interacting with it a lot more intuitive!

The whole library is built around the concepts of **Audio Commands** and **Compiled Audio Commands**. <br/>
You can **nest audio commands inside other audio commands** to get more complex behavior! <br/>
And, you can treat **Compiled Audio Commands** just like uncompiled ones!

It's like Google's **Flutter** but for audio manipulation.

## Documentation

### Commands

Here's a list of the currently available audio commands.

| AudioCommand | Description |
| --- | --- |
| `Play(path: string)` | The most basic audio command. Plays the audio file specified in `path`! |
| `Clip(to_clip: AudioCommand, duration: Seconds, offset: Seconds = 0)` | Creates a clip of its child command starting at `offset` and playing from there for `duration`. |
| `Repeat(to_repeat: AudioCommand, duration: Seconds)` | Repeats its child command until it fits into `duration`. |
| `Sequence(sequence: AudioCommand[])` | Plays each command in `sequence` one after the other. |
| `Gain(to_gain: AudioCommand, gain_commands: GainCommand[]) ` | Plays its child command normally but `gain_commands` lets you control how the volume will change over time! |

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

compile it into a track,

```typescript
const rhythm = new RhythmContext(/* new AudioContext() [You can optionally provide an AudioContext] */);
const track = await rhythm.compile(some_command);
```

and finally play it!

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

### Play

To play a track with rhythm.js, try this!

```typescript
import { RhythmContext, Play } from "../dist/rhythm.esm.js";

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
import { RhythmContext, Play, Clip } from "../dist/rhythm.esm.js";

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
In this code snippet, the `Repeat` node will keep repeating the `Clip` node inside it while it hasn't been 20 seconds yet.

```typescript
import { RhythmContext, Play, Clip } from "../dist/rhythm.esm.js";

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

# Credits
Sample music in tests from [StarryAttic](https://www.youtube.com/watch?v=FqI9cM6fczU) on Youtube!