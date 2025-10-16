import math
import threading
from typing import List, Any
import os
import random
import time
import warnings
from pydub.utils import ratio_to_db, db_to_float
from pydub import AudioSegment


class SampleSplittingSegmentMap:
    def __init__(
            self,
            split_start_at_included: int | None,
            split_end_at_included: int | None,
            fade_from: int | None,
            fade_to: int | None):
        self.split_start_at_included = split_start_at_included
        self.split_end_at_included = split_end_at_included
        self.fade_from = fade_from
        self.fade_to = fade_to


# Lock to ensure thread-safe access to messages_for_polling
messages_lock = threading.Lock()


def log_for_polling(message: str, messages_for_polling):
    with messages_lock:
        print(message)
        messages_for_polling.append(message)


def empty_log_for_polling(messages_for_polling):
    with messages_lock:
        del messages_for_polling[:]
        messages_for_polling.append("Hello!")


def translate_bit_depth_for_pydub(bit_depth: int):
    return bit_depth // 8


def get_bit_depth_from_audio_segment(file: AudioSegment):
    bit_depth = file.sample_width  # 1-4. 1=8 2=16 3=24 4=32

    if bit_depth == 1:
        bit_depth = 8

    elif bit_depth == 2:
        bit_depth = 16

    elif bit_depth == 3:
        bit_depth = 24

    elif bit_depth == 4:
        bit_depth = 32

    return bit_depth


def get_sample_rate(file: AudioSegment):
    return file.frame_rate


def create_soundtrack(

        samples_variations_filenames: List[str],
        timing_windows: Any,

        max_length_seconds: int,

        sample_concat_overlay_seconds: float,
        sample_stitching_method: str,  # "JOIN_WITH_OVERLAY", "JOIN_WITH_CROSSFADE"
        bit_depth: int,
        sample_rate: int,
        messages_for_polling):
    # Initialize an empty audio segment with 0 duration for storing the concatenated sample
    original_concatenated_sample = AudioSegment.silent(duration=0)
    original_concatenated_sample.set_frame_rate(sample_rate)
    original_concatenated_sample.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

    # Load sample
    sample_variations_audio_segments: List[AudioSegment] = [AudioSegment.from_file(variation_filename) for
                                                            variation_filename in samples_variations_filenames]

    for j in range(len(sample_variations_audio_segments)):
        found_sample_rate = get_sample_rate(sample_variations_audio_segments[j])
        if sample_rate != found_sample_rate:
            warnings.warn(
                "\nDifferent sample rate detected for: {samples_variations_filename}.\n"
                "Desired track sample rate: {desired_sample_rate}.\n"
                "The actual sample has: {sample_actual_sample_rate}. This can cause artifacts when resampling.\n"
                "It is recommended to keep the same sample rate as the samples that will be mixed."
                .format(
                    samples_variations_filename=samples_variations_filenames[j],
                    desired_sample_rate=sample_rate,
                    sample_actual_sample_rate=found_sample_rate
                )

            )
            time.sleep(1)
            log_for_polling("Will resample at the desired sample rate...", messages_for_polling)
            sample_variations_audio_segments[j] = sample_variations_audio_segments[j].set_frame_rate(sample_rate)
        sample_variations_audio_segments[j] = sample_variations_audio_segments[j].set_sample_width(
            translate_bit_depth_for_pydub(bit_depth))

    log_for_polling(samples_variations_filenames[0] + ": bit depth " + str(
        get_bit_depth_from_audio_segment(sample_variations_audio_segments[0])) + ", sample rate: " + str(
        get_sample_rate(sample_variations_audio_segments[0])), messages_for_polling)

    desired_track_length_milliseconds = max_length_seconds * 1000

    # Keep adding the sample variations until the processed sample is processedSampleMaxLength minutes
    while len(original_concatenated_sample) < desired_track_length_milliseconds:

        # pick random sample variation to concatenate the final audio data
        random_sample_variation_index = random.randint(0, len(samples_variations_filenames) - 1)

        # log_for_polling(f"Current concatenated length: {len(original_concatenated_sample)}")
        # log_for_polling(f"Adding sample of length: {len(sample_variations_audio_segments[random_sample_variation_index])}")

        # make sure stitching overlay is not bigger than any of the stitched parts
        safe_sample_concat_overlay_milliseconds = sample_concat_overlay_seconds * 1000
        if len(original_concatenated_sample) - 1 < safe_sample_concat_overlay_milliseconds:
            safe_sample_concat_overlay_milliseconds = 0

        if sample_stitching_method == "JOIN_WITH_CROSSFADE":
            original_concatenated_sample = original_concatenated_sample.append(
                sample_variations_audio_segments[random_sample_variation_index],
                crossfade=safe_sample_concat_overlay_milliseconds)
        elif sample_stitching_method == "JOIN_WITH_OVERLAY":

            # Determine the position for the overlay
            overlay_position = len(original_concatenated_sample) - safe_sample_concat_overlay_milliseconds

            # Get the sample to overlay
            overlay_sample = sample_variations_audio_segments[random_sample_variation_index]

            # Calculate the length of the overlay sample
            overlay_length = len(overlay_sample)

            silence_duration = overlay_length - safe_sample_concat_overlay_milliseconds
            silence_segment = AudioSegment.silent(duration=silence_duration)
            silence_segment.set_frame_rate(sample_rate)
            silence_segment.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

            original_concatenated_sample = original_concatenated_sample.append(silence_segment, crossfade=0)
            # Perform the overlay
            original_concatenated_sample = original_concatenated_sample.overlay(
                overlay_sample,
                position=overlay_position
            )
        else:
            return Exception("Unknown stitching method")

    # crop processed sample at exact processedSampleMaxLength
    original_concatenated_sample = original_concatenated_sample[:desired_track_length_milliseconds]

    # Process originalConcatenatedSample by taking parts out of it and applying
    # fading effects then adding it to processedConcatenatedSample

    # Initialize an empty audio segment with 0 duration for concatenating processed parts of originalConcatenatedSample
    processed_concatenated_sample = AudioSegment.silent(duration=0)
    processed_concatenated_sample.set_frame_rate(sample_rate)
    processed_concatenated_sample.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

    # setting a total track length less than maximum sample window length will cause undesired behavior
    for timing_window in timing_windows:
        if timing_window["params"]["minTimeframeLengthMs"] >= desired_track_length_milliseconds or timing_window["params"]["maxTimeframeLengthMs"] >= desired_track_length_milliseconds:
            raise Exception("cannot accept total track length to be less than timeframe min or timeframe max")

    # fill the mapping array with maximum elements that the algorithm can possibly fill
    # (if it always chooses minimum random intervals when it splits originalConcatenatedSample into segments )
    min_sample_segment_timeframe_milliseconds_from_all_timeframes = timing_windows[0]["params"]["minTimeframeLengthMs"]
    for timing_window in timing_windows:
        if min_sample_segment_timeframe_milliseconds_from_all_timeframes > timing_window["params"][
            "minTimeframeLengthMs"]:
            min_sample_segment_timeframe_milliseconds_from_all_timeframes = timing_window["params"][
                "minTimeframeLengthMs"]

    if min_sample_segment_timeframe_milliseconds_from_all_timeframes == 0:
        raise Exception("min_sample_segment_timeframe_milliseconds_from_all_timeframes cannot be zero")

    maximum_hypotetical_possible_sample_segments = int(
        desired_track_length_milliseconds // min_sample_segment_timeframe_milliseconds_from_all_timeframes)
    sample_processing_mapping: List[SampleSplittingSegmentMap] = [
        SampleSplittingSegmentMap(
            split_start_at_included=None,
            split_end_at_included=None,
            fade_from=None,
            fade_to=None
        ) for _ in range(maximum_hypotetical_possible_sample_segments)
    ]

    # temp variables
    _lastSegmentVolumeEnd = random.randint(
        safe_ratio_to_db(timing_windows[0]["params"]["minVolRatio"]),
        safe_ratio_to_db(timing_windows[0]["params"]["maxVolRatio"]))
    _lastSegmentSplitEndIncluded = -1
    _originalSampleLength = len(original_concatenated_sample)
    _mappedSegmentsCount = 0

    for i in range(len(sample_processing_mapping)):
        current_timing_window = timing_windows[0]
        for timing_window_index, timing_window in reversed(list(enumerate(timing_windows))):
            if timing_window_index == 0 and timing_window['startAt'] != 0:
                raise Exception("The startAt property needs to be 0 in the first time window.")

            if _lastSegmentSplitEndIncluded + 1 >= timing_window['startAt']:
                current_timing_window = timing_window
                break  # Breaks the inner loop, continues with next iteration of the outer loop

        max_volume_gain_db = safe_ratio_to_db(current_timing_window["params"]["maxVolRatio"])
        min_volume_gain_db = safe_ratio_to_db(current_timing_window["params"]["minVolRatio"])

        fading_timeframe_seconds_min = int(current_timing_window["params"]["minTimeframeLengthMs"] / 1000)
        fading_timeframe_seconds_max = int(current_timing_window["params"]["maxTimeframeLengthMs"] / 1000)

        # create a mapping of how the originalConcatenatedSample will be processed further
        # split originalConcatenatedSample at random timing positions
        max_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_max * 1000
        min_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_min * 1000

        if max_sample_segment_timeframe_milliseconds < min_sample_segment_timeframe_milliseconds:
            raise Exception(samples_variations_filenames[
                                0] + ": the max timeframe sample length is shorter than min timeframe sample length")

        if desired_track_length_milliseconds < min_sample_segment_timeframe_milliseconds:
            log_for_polling(samples_variations_filenames[
                                0] + ": the final track length is shorter than its minimum fading timeframes length" + str(
                desired_track_length_milliseconds) + " " + str(min_sample_segment_timeframe_milliseconds),
                            messages_for_polling)
            log_for_polling("setting minimum fading timeframes length to the final track length", messages_for_polling)
            min_sample_segment_timeframe_milliseconds = desired_track_length_milliseconds - 100

        if desired_track_length_milliseconds < max_sample_segment_timeframe_milliseconds:
            log_for_polling(samples_variations_filenames[
                                0] + ": the final track length is shorter than the max fading timeframes length",
                            messages_for_polling)
            log_for_polling("setting maximum fading timeframes length to the final track length", messages_for_polling)
            max_sample_segment_timeframe_milliseconds = desired_track_length_milliseconds - 50

        random_segment_duration = random.randint(
            min_sample_segment_timeframe_milliseconds,
            max_sample_segment_timeframe_milliseconds)
        random_fade_to = random.randint(min_volume_gain_db, max_volume_gain_db)

        sample_processing_mapping[i].split_start_at_included = _lastSegmentSplitEndIncluded + 1
        sample_processing_mapping[i].split_end_at_included = min(
            _originalSampleLength,
            sample_processing_mapping[i].split_start_at_included + random_segment_duration)
        sample_processing_mapping[i].fade_from = _lastSegmentVolumeEnd
        sample_processing_mapping[i].fade_to = random_fade_to

        _lastSegmentSplitEndIncluded = sample_processing_mapping[i].split_end_at_included
        _lastSegmentVolumeEnd = sample_processing_mapping[i].fade_to
        _mappedSegmentsCount = i + 1

        if sample_processing_mapping[i].split_start_at_included >= _originalSampleLength:
            break

    # discard the unfilled SampleSplittingSegmentMap items
    sample_processing_mapping = sample_processing_mapping[:_mappedSegmentsCount]

    # split segments and apply fading according to the mapping
    for i in range(len(sample_processing_mapping)):

        split_start_at_included = sample_processing_mapping[i].split_start_at_included
        split_end_at_included = sample_processing_mapping[i].split_end_at_included

        fade_from = sample_processing_mapping[i].fade_from
        fade_to = sample_processing_mapping[i].fade_to

        sample_segment = original_concatenated_sample[split_start_at_included:split_end_at_included + 1]

        segment_length = len(sample_segment)  # Use the full segment length for fade

        if segment_length > 0:
            processed_concatenated_sample += sample_segment.fade(
                from_gain=fade_from,
                to_gain=fade_to,
                start=0,
                end=len(sample_segment) - 1)

    return processed_concatenated_sample


def normalize_soundtrack(audio_track: AudioSegment, messages_for_polling) -> AudioSegment:
    # Calculate peak level
    peak_level = audio_track.max_dBFS

    log_for_polling("Calculated max peak level: {peak}".format(peak=peak_level), messages_for_polling)

    # Calculate normalization gain
    # Set a maximum peak level (in dB)
    max_peak_level = -0.1
    log_for_polling("Desired max peak level: {peak}".format(peak=max_peak_level), messages_for_polling)

    # Calculate the adjustment needed
    normalization_gain = max_peak_level - peak_level
    log_for_polling("Adjusting gain to: {gain}".format(gain=normalization_gain), messages_for_polling)

    # Normalize the soundtrack
    normalized_soundtrack = audio_track.apply_gain(normalization_gain)
    log_for_polling("Finished applying normalization gain.", messages_for_polling)

    return normalized_soundtrack


def safe_ratio_to_db(ratio) -> int:
    if ratio == 0:
        return -120  # or some large negative value representing silence
    if ratio < 0:
        raise ValueError("Ratio must be non-negative.")

    return math.floor(ratio_to_db(ratio))


# Calculate gain reduction needed based on dB peak levels of all tracks
def calculate_adjusted_gain_reduction_necessary_to_avoid_clipping_when_mixed(all_tracks_max_peaks: List[float],
                                                                             target_peak_db: float = 0.0) -> float:
    # Convert each peak in dB to linear amplitude ratios
    linear_peaks = [db_to_float(peak_db) for peak_db in all_tracks_max_peaks]

    # Sum peaks with an empirical adjustment factor for realistic mixing (approx 0.707 per added track)
    combined_peak_ratio = sum([peak * 0.707 for peak in linear_peaks])

    # Convert adjusted combined ratio back to dB
    combined_peak_db = safe_ratio_to_db(combined_peak_ratio)

    # Calculate gain reduction to bring combined peak down to the target peak level
    gain_reduction = target_peak_db - combined_peak_db
    if gain_reduction < 0:
        return gain_reduction
    else:
        return 0


def audio_format_to_file_extension(audio_format: str):
    if audio_format == "mp3":
        return "mp3"
    elif audio_format == "adts":
        return "aac"
    elif audio_format == "ogg":
        return "ogg"
    elif audio_format == "wav":
        return "wav"


def process_json(jsonData, messages_for_polling):
    empty_log_for_polling(messages_for_polling)

    PROCESSING_BIT_DEPTH = 32
    PROCESSING_SAMPLE_RATE = 44100

    FINAL_TRACK_BIT_DEPTH = jsonData["bitDepth"]
    FINAL_TRACK_SAMPLE_RATE = jsonData["sampleRate"]
    final_length_seconds = int(jsonData["lengthMs"] // 1000)
    audio_format = jsonData["format"]
    samples_data_config = jsonData["sampleDataConfig"]

    final_track = AudioSegment.silent(duration=final_length_seconds * 1000)
    final_track.set_frame_rate(PROCESSING_SAMPLE_RATE)
    final_track.set_sample_width(translate_bit_depth_for_pydub(PROCESSING_BIT_DEPTH))
    normalized_processed_sound_tracks: List[AudioSegment] = []

    number_of_tracks = len(samples_data_config)

    log_for_polling("Will process {number_of_tracks} tracks...".format(number_of_tracks=number_of_tracks), messages_for_polling)
    for i in range(number_of_tracks):
        log_for_polling("Processing track: " + str(i + 1) + " of " + str(number_of_tracks), messages_for_polling)

        current_sample_data_config = samples_data_config[i]
        current_sample_stitching_method = current_sample_data_config["stitchingMethod"]
        current_sample_concat_overlay_milliseconds = current_sample_data_config["concatOverlayMs"]
        current_sample_variations_filepaths = current_sample_data_config["variationFilePath"]

        try:
            soundtrack = create_soundtrack(
                samples_variations_filenames=current_sample_variations_filepaths,
                timing_windows=current_sample_data_config["timingWindows"],
                max_length_seconds=final_length_seconds,
                sample_concat_overlay_seconds=int(current_sample_concat_overlay_milliseconds / 1000),
                sample_stitching_method=current_sample_stitching_method,
                bit_depth=PROCESSING_BIT_DEPTH,  # set maximum bit depth for processing
                sample_rate=PROCESSING_SAMPLE_RATE,
                messages_for_polling = messages_for_polling
            )

            # try to normalize down each track take into consideration maximum number
            # of tracks that will be combined. Use -1db for each new track that will be overlaid.
            # This is not bulletproof, but it reduces the risk of final track clipping
            # soundtrack = soundtrack.apply_gain(-number_of_tracks)

            temp_soundtrack_filepath = "generated/temp-track-{track_index}.tmp".format(track_index=i)
            log_for_polling("Exporting temporary track: {temp_soundtrack_filepath} ...".format(
                temp_soundtrack_filepath=temp_soundtrack_filepath), messages_for_polling)
            soundtrack.export(temp_soundtrack_filepath, format="wav")
            log_for_polling("Successfully exported temporary track: {temp_soundtrack_filepath}".format(
                temp_soundtrack_filepath=temp_soundtrack_filepath), messages_for_polling)
        except Exception as e:
            log_for_polling("Error creating soundtrack: {error}".format(error=str(e)), messages_for_polling)
            return

    log_for_polling("Calculating the risk of clipping after mixing all tracks", messages_for_polling)
    all_tracks_max_peaks = [0.0] * number_of_tracks
    for i in range(number_of_tracks):
        temp_soundtrack_filepath = "generated/temp-track-{track_index}.tmp".format(track_index=i)
        track = AudioSegment.from_file(temp_soundtrack_filepath, format="wav")
        all_tracks_max_peaks[i] = track.max_dBFS
    # calculate gain reduction needed based on the db peak levels of all tracks (stored in all_tracks_max_peaks)
    calculated_gain_reduction_to_apply_to_all_tracks = calculate_adjusted_gain_reduction_necessary_to_avoid_clipping_when_mixed(
        all_tracks_max_peaks)
    log_for_polling("Calculated gain reduction to apply to all tracks: {reduction} dB".format(
        reduction=calculated_gain_reduction_to_apply_to_all_tracks), messages_for_polling)

    log_for_polling("Will overlay {number_of_tracks} tracks...".format(number_of_tracks=number_of_tracks), messages_for_polling)
    for i in range(number_of_tracks):
        log_for_polling("Mixing track: " + str(i + 1) + " of " + str(number_of_tracks), messages_for_polling)
        temp_soundtrack_filepath = "generated/temp-track-{track_index}.tmp".format(track_index=i)
        log_for_polling("Overlaying track {filepath} ...".format(filepath=temp_soundtrack_filepath), messages_for_polling)
        track = AudioSegment.from_file(temp_soundtrack_filepath, format="wav")

        if calculated_gain_reduction_to_apply_to_all_tracks < 0:
            track = track.apply_gain(calculated_gain_reduction_to_apply_to_all_tracks)

        final_track = final_track.overlay(track)

        if os.path.exists(temp_soundtrack_filepath):
            os.remove(temp_soundtrack_filepath)
        else:
            log_for_polling(
                "Cannot remove temporary stored track from disk: {path}".format(path=temp_soundtrack_filepath), messages_for_polling)

    log_for_polling("Normalizing final track", messages_for_polling)
    final_track = normalize_soundtrack(final_track, messages_for_polling)

    if PROCESSING_SAMPLE_RATE != FINAL_TRACK_SAMPLE_RATE:
        log_for_polling("Adjusting final soundtrack sample rate to: " + str(FINAL_TRACK_SAMPLE_RATE) + "...", messages_for_polling)
        final_track = final_track.set_frame_rate(FINAL_TRACK_SAMPLE_RATE)
    else:
        log_for_polling("Final soundtrack sample rate is set to: " + str(FINAL_TRACK_SAMPLE_RATE), messages_for_polling)

    if PROCESSING_BIT_DEPTH != FINAL_TRACK_BIT_DEPTH:
        log_for_polling("Adjusting final soundtrack bit depth to: " + str(FINAL_TRACK_BIT_DEPTH) + "...", messages_for_polling)
        final_track = final_track.set_sample_width(translate_bit_depth_for_pydub(FINAL_TRACK_BIT_DEPTH))
    else:
        log_for_polling("Final soundtrack bit depth is set to: " + str(FINAL_TRACK_BIT_DEPTH), messages_for_polling)

    log_for_polling(
        "Final track check: bit depth " + str(
            get_bit_depth_from_audio_segment(final_track)) + ", sample rate: " + str(
            get_sample_rate(final_track)), messages_for_polling)

    log_for_polling("Exporting...", messages_for_polling)
    # Export the final track
    final_track.export("generated/processedConcatenatedSample." + audio_format_to_file_extension(audio_format),
                       format=audio_format)
    log_for_polling("Exporting finished.", messages_for_polling)
