package com.collector.app;

import android.content.Context;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;

/**
 * Cross-process exclusive microphone ownership for Collector's recorder service
 * and Android on-device speech recognizer. The OS releases the lock if a process dies.
 */
public final class CollectorMicrophoneLock implements AutoCloseable {
    private final RandomAccessFile file;
    private final FileChannel channel;
    private final FileLock lock;

    private CollectorMicrophoneLock(RandomAccessFile file, FileChannel channel, FileLock lock) {
        this.file = file;
        this.channel = channel;
        this.lock = lock;
    }

    public static CollectorMicrophoneLock tryAcquire(Context context, String owner) {
        RandomAccessFile file = null;
        FileChannel channel = null;
        try {
            File lockFile = new File(context.getFilesDir(), "microphone-owner.lock");
            file = new RandomAccessFile(lockFile, "rw");
            channel = file.getChannel();
            FileLock lock;
            try {
                lock = channel.tryLock();
            } catch (OverlappingFileLockException busy) {
                closeQuietly(channel, file);
                return null;
            }
            if (lock == null) {
                closeQuietly(channel, file);
                return null;
            }
            channel.truncate(0L);
            channel.position(0L);
            String metadata = String.valueOf(owner) + "|" + android.os.Process.myPid()
                + "|" + System.currentTimeMillis();
            channel.write(java.nio.ByteBuffer.wrap(metadata.getBytes(StandardCharsets.UTF_8)));
            channel.force(true);
            return new CollectorMicrophoneLock(file, channel, lock);
        } catch (Exception error) {
            closeQuietly(channel, file);
            return null;
        }
    }

    private static void closeQuietly(FileChannel channel, RandomAccessFile file) {
        try { if (channel != null) channel.close(); } catch (Exception ignored) {}
        try { if (file != null) file.close(); } catch (Exception ignored) {}
    }

    @Override
    public void close() {
        try { if (lock.isValid()) lock.release(); } catch (Exception ignored) {}
        closeQuietly(channel, file);
    }
}
