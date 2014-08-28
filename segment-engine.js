!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var n;"undefined"!=typeof window?n=window:"undefined"!=typeof global?n=global:"undefined"!=typeof self&&(n=self),n.SegmentEngine=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/* written in ECMAscript 6 */
/**
 * @fileoverview WAVE audio granular engine
 * @author Norbert.Schnell@ircam.fr, Victor.Saiz@ircam.fr, Karim.Barkati@ircam.fr
 */
"use strict";

var audioContext = _dereq_("audio-context");
var EventEngine = _dereq_("event-engine");

var GranularEngine = (function(super$0){var DP$0 = Object.defineProperty;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,Object.getOwnPropertyDescriptor(s,p));}}return t};MIXIN$0(GranularEngine, super$0);

  function GranularEngine() {var buffer = arguments[0];if(buffer === void 0)buffer = null;
    super$0.call(this, false); // by default events don't sync to transport position

    this.buffer = buffer; // audio buffer
    this.periodAbs = 0.01; // absolute period
    this.periodRel = 0; // period relative to duration
    this.periodVar = 0; // period variation relative to grain period
    this.positionArray = [0.0]; // segment positions
    this.positionVar = 0.003; // position variation in sec
    this.durationArray = [0.0]; // segment durations
    this.durationAbs = 0.1; // absolute grain duration
    this.durationRel = 0; // duration relative to absolute period
    this.offsetArray = [0.0]; // segment offsets
    this.offsetsAbs = 0.1; // absolute offset
    this.offsetsRel = 0; // offset relative to duration
    this.attackAbs = 0; // absolute attack time
    this.attackRel = 0.5; // attack time relative to duration
    this.releaseAbs = 0; // absolute release time
    this.releaseRel = 0.5; // release time relative to duration
    this.resampling = 0; // resampling in cent
    this.resamplingVar = 0; // resampling variation in cent
    this.markerIndex = 0;

    this.callback = null;
    this.__gainNode = audioContext.createGain();

    this.outputNode = this.__gainNode;
  }GranularEngine.prototype = Object.create(super$0.prototype, {"constructor": {"value": GranularEngine, "configurable": true, "writable": true}, gain: {"get": gain$get$0, "set": gain$set$0, "configurable": true, "enumerable": true} });DP$0(GranularEngine, "prototype", {"configurable": false, "enumerable": false, "writable": false});

  // EventEngine syncEvent
  GranularEngine.prototype.syncEvent = function(time) {
    var cycles = -this.__phase;

    if (this.__aligned || this.transport) // is always aligned in transport
      cycles += time / this.period;

    if (this.transport && this.transport.reverse)
      cycles *= -1;

    var delay = (Math.ceil(cycles) - cycles) * this.period;

    return delay;
  }

  // EventEngine executeEvent
  GranularEngine.prototype.executeEvent = function(time, audioTime) {
    return this.trigger(audioTime);
  }

  function gain$set$0(value) {
    this.__gainNode.gain.value = value;
  }

  function gain$get$0() {
    return this.__gainNode.gain.value;
  }

  GranularEngine.prototype.trigger = function(time) {
    var grainTime = time ||  audioContext.currentTime;
    var grainPeriod = this.periodAbs;
    var markerIndex = this.markerIndex;

    if (this.buffer) {
      var grainPosition = 0.0;
      var grainDuration = 0.0;
      var grainOffset = 0.0;
      var resamplingRate = 1.0;

      // calculate resampling
      if (this.resampling !== 0 || this.resamplingVar > 0) {
        var randomResampling = (Math.random() - 0.5) * 2.0 * this.resamplingVar;
        resamplingRate = Math.pow(2.0, (this.resampling + randomResampling) / 1200.0);
      }

      // calculate inter marker distance
      if (grainDuration === 0 || this.periodRel > 0) {
        var nextPosition = this.positionArray[markerIndex + 1] || this.buffer.duration;
        var nextOffset = this.offsetArray[markerIndex + 1] || 0;
        var interMarker = nextPosition - grainPosition;

        // correct inter marker distance by offsets
        //   offset > 0: the grain's reference position is after the given segment position
        if (grainOffset > 0)
          interMarker -= grainOffset;

        if (nextOffset > 0)
          interMarker += nextOffset;

        if (interMarker < 0)
          interMarker = 0;

        // use inter marker distance instead of segment duration 
        if (grainDuration === 0)
          grainDuration = interMarker;

        // calculate period relative to inter marker distance
        grainPeriod += this.periodRel * interMarker;
      }

      // add relative and absolute grain duration
      grainDuration *= this.durationRel;
      grainDuration += this.durationAbs;

      // add relative and absolute grain offset
      grainOffset *= this.offsetRel;
      grainOffset += this.offsetAbs;

      // apply grain offset
      //   offset > 0: the grain's reference position is after the given segment position
      //   offset < 0: the given segment position is the grains reference position and the duration has to be corrected by the offset
      if (grainOffset < 0) {
        grainDuration -= grainOffset;
        grainPosition += grainOffset;
        grainTime += (grainOffset / resamplingRate);
      } else {
        grainTime -= (grainOffset / resamplingRate);
      }

      // randomize grain position
      if (this.positionVar > 0)
        grainPosition += 2.0 * (Math.random() - 0.5) * this.positionVar;

      // shorten duration of grains over the edges of the buffer
      if (grainPosition < 0) {
        grainDuration += grainPosition;
        grainPosition = 0;
      }

      if (grainPosition + grainDuration > this.buffer.duration)
        grainDuration = this.buffer.duration - grainPosition;

      // make grain
      if (this.gain > 0 && grainDuration > 0) {
        // make grain envelope
        var envelopeNode = audioContext.createGain();
        var attack = this.attackAbs + this.attackRel * grainDuration;
        var release = this.releaseAbs + this.releaseRel * grainDuration;

        if (attack + release > grainDuration) {
          var factor = grainDuration / (attack + release);
          attack *= factor;
          release *= factor;
        }

        if (grainTime < audioContext.currentTime)
          grainTime = audioContext.currentTime;

        var attackEndTime = grainTime + attack;
        var grainEndTime = grainTime + grainDuration;
        var releaseStartTime = grainEndTime - release;

        envelopeNode.gain.value = this.gain;

        envelopeNode.gain.setValueAtTime(0.0, grainTime);
        envelopeNode.gain.linearRampToValueAtTime(this.gain, attackEndTime);

        if (releaseStartTime > attackEndTime)
          envelopeNode.gain.setValueAtTime(this.gain, releaseStartTime);

        envelopeNode.gain.linearRampToValueAtTime(0.0, grainEndTime);
        envelopeNode.connect(this.gainNode);

        // make source
        var source = audioContext.createBufferSource();

        source.buffer = this.buffer;
        source.playbackRate.value = resamplingRate;
        source.connect(envelopeNode);
        envelopeNode.connect(this.gainNode);

        source.start(grainTime, grainPosition);
        source.stop(grainTime + grainDuration / resamplingRate);
      }
    }

    return grainPeriod;
  }
;return GranularEngine;})(EventEngine);
module.exports = GranularEngine;
},{"audio-context":2,"event-engine":3}],2:[function(_dereq_,module,exports){
/* Generated by es6-transpiler v 0.7.14-2 */
// instantiates an audio context in the global scope if not there already
var context = window.audioContext || new AudioContext();
window.audioContext = context;
module.exports = context;
},{}],3:[function(_dereq_,module,exports){

/**
 * @fileoverview WAVE audio event engine base class
 * @author Norbert.Schnell@ircam.fr, Victor.Saiz@ircam.fr, Karim.Barkati@ircam.fr
 * @version 3.0
 */
"use strict";

var EventEngine = (function(){var DP$0 = Object.defineProperty;
  function EventEngine() {var alignToTransportPosition = arguments[0];if(alignToTransportPosition === void 0)alignToTransportPosition = true;
    this.scheduler = null;
    this.transport = null;

    this.alignToTransportPosition = alignToTransportPosition; // true: events are aligned to position when executed within transport

    this.outputNode = null;
  }DP$0(EventEngine, "prototype", {"configurable": false, "enumerable": false, "writable": false});

  /**
   * Synchronize event engine
   * @param {float} time synchronization time or transport position
   * @return {float} next event time
   */
  EventEngine.prototype.syncEvent = function(time) {
    return 0;
  }

  /**
   * Execute next event
   * @param {float} time the event's scheduler time or transport position
   * @param {float} audioTime the event's corresponding audio context's currentTime
   * @return {float} next event time
   */
  EventEngine.prototype.executeEvent = function(time, audioTime) {
    return Infinity; // return next event time
  }

  /**
   * Request event engine resynchronization (called by engine itself)
   */
  EventEngine.prototype.resyncEngine = function() {
    if(this.scheduler)
      this.scheduler.resync(this);
  }

  /**
   * Request event engine rescheduling (called by engine itself)
   * @param {float} time the event's new scheduler time or transport position
   */
  EventEngine.prototype.rescheduleEngine = function(time) {
    if(this.scheduler)
      this.scheduler.reschedule(this, time);
  }

  EventEngine.prototype.connect = function(target) {
    this.outputNode.connect(target);
    return this;
  }

  EventEngine.prototype.disconnect = function(target) {
    this.outputNode.disconnect(target);
    return this;
  }
;return EventEngine;})();

module.exports = EventEngine;
},{}]},{},[1])
(1)
});