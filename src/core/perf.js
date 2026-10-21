// Counts events (rendered frames, recognitions) and reports a rate once per period.
// The caller passes the time in, like the agent, so tests can use a fake clock.
export class PerfMeter {
  constructor(periodMs = 1000) {
    this.periodMs = periodMs;
    this.start = null;
    this.count = 0; this.msSum = 0;
    this.rate = 0;      // events per second over the last period
    this.avgMs = null;  // average duration of an event, if durations were given
  }

  // Record one event. ms (optional) is how long it took.
  tick(ms) {
    this.count++;
    if (ms != null) this.msSum += ms;
  }

  // Call every frame. Returns true when a new reading is ready, so the page only
  // touches the DOM about once a second.
  update(now) {
    if (this.start === null) { this.start = now; return false; }
    const elapsed = now - this.start;
    if (elapsed < this.periodMs) return false;
    this.rate = this.count * 1000 / elapsed;
    this.avgMs = this.count && this.msSum ? this.msSum / this.count : null;
    this.start = now; this.count = 0; this.msSum = 0;
    return true;
  }
}
