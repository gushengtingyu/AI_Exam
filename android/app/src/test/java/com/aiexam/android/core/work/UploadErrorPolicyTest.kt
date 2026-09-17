package com.aiexam.android.core.work

import com.aiexam.android.core.storage.ImagePreparationException
import java.io.IOException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UploadErrorPolicyTest {
    @Test
    fun doesNotRetryLocalImageIoFailures() {
        assertFalse(UploadErrorPolicy.isRetryable(ImagePreparationException("无法读取图片", IOException("missing"))))
    }

    @Test
    fun retriesNetworkFailures() {
        assertTrue(UploadErrorPolicy.isRetryable(IOException("offline")))
    }

    @Test
    fun doesNotRetryValidationFailures() {
        assertFalse(UploadErrorPolicy.isRetryable(IllegalArgumentException("invalid image")))
    }
}
