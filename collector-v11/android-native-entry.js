import { Capacitor, registerPlugin } from '@capacitor/core';

const Recorder = registerPlugin('CollectorRecorder');
const Alarms = registerPlugin('CollectorAlarms');
const Speech = registerPlugin('CollectorSpeech');

window.CollectorAndroidRecorder = Object.freeze({
  isAvailable() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },
  startRecording(options = {}) {
    return Recorder.startRecording(options);
  },
  pauseRecording(recordingId) {
    return Recorder.pauseRecording({ recordingId });
  },
  resumeRecording(recordingId) {
    return Recorder.resumeRecording({ recordingId });
  },
  stopRecording(recordingId) {
    return Recorder.stopRecording({ recordingId });
  },
  getRecordingState() {
    return Recorder.getRecordingState();
  },
  listRecordings() {
    return Recorder.listRecordings();
  },
  getRecording(recordingId) {
    return Recorder.getRecording({ recordingId });
  },
  deleteRecording(recordingId) {
    return Recorder.deleteRecording({ recordingId });
  },
  getOfflineSpeechSupport(language = 'ro-RO') { return Speech.getOfflineSupport({ language }); },
  scheduleAlarm(title, triggerAtMs) { return Alarms.schedule({ title, triggerAtMs }); },
  cancelAlarm(id) { return Alarms.cancel({ id }); },
  listAlarms() { return Alarms.list(); },
  toPlaybackUrl(uri) {
    return Capacitor.convertFileSrc(uri);
  },
});

window.CollectorAndroidSpeech = Object.freeze({
  isAvailable() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },
  getOfflineSpeechSupport(language = 'ro-RO') {
    return Speech.getOfflineSupport({ language });
  },
  startListening(language = 'ro-RO', continuous = true) {
    return Speech.startListening({ language, continuous });
  },
  stopListening(sessionId) {
    return Speech.stopListening({ sessionId });
  },
  cancelListening(sessionId) {
    return Speech.cancelListening({ sessionId });
  },
  addListener(eventName, listener) {
    return Speech.addListener(eventName, listener);
  },
});
