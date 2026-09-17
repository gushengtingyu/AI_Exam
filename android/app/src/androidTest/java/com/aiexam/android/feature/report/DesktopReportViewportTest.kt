package com.aiexam.android.feature.report

import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.core.app.ActivityScenario
import com.aiexam.android.MainActivity
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class DesktopReportViewportTest {
    @Test fun narrowWebViewKeepsDesktopColumnsBeforeAndAfterZoom() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            lateinit var web: WebView
            val fixturePath = InstrumentationRegistry.getArguments().getString("reportFixture")
            val loaded = CountDownLatch(1)
            scenario.onActivity { activity ->
                web = WebView(activity)
                web.settings.javaScriptEnabled = true
                web.settings.useWideViewPort = true
                web.settings.loadWithOverviewMode = false
                web.settings.textZoom = 100
                web.settings.builtInZoomControls = true
                web.settings.displayZoomControls = false
                web.settings.layoutAlgorithm = android.webkit.WebSettings.LayoutAlgorithm.NORMAL
                val host = FrameLayout(activity)
                host.addView(web, FrameLayout.LayoutParams((360 * activity.resources.displayMetrics.density).toInt(), 1200))
                activity.setContentView(host)
                web.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) { loaded.countDown() }
                }
                val fixture = fixturePath?.let { java.io.File(it).readText() }
                web.loadDataWithBaseURL("https://yzhzjqzyyth.cn/semester-report/", DesktopReportHtml.prepare(fixture ?: """
                    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>body{margin:0}.report-document{width:min(1120px,100% - 30px);margin:auto}
                    .grid{display:grid;grid-template-columns:1fr 1fr}
                    @media(max-width:900px){.grid{grid-template-columns:1fr}}
                    @media(max-width:640px){.report-document{width:100%}}</style></head>
                    <body><main class="report-document"><div class="grid"><span>知识点</span><span>掌握情况</span></div></main></body></html>
                """.trimIndent()), "text/html", "UTF-8", null)
            }
            assertTrue("Page loads", loaded.await(15, TimeUnit.SECONDS))
            fun inspect(): JSONArray {
                val done = CountDownLatch(1)
                var value = ""
                scenario.onActivity {
                    web.evaluateJavascript("""[document.documentElement.clientWidth,document.querySelector('.report-document').getBoundingClientRect().width,matchMedia('(max-width:900px)').matches,document.querySelector('.grid')?getComputedStyle(document.querySelector('.grid')).gridTemplateColumns:'server-report']""") {
                        value = it
                        done.countDown()
                    }
                }
                assertTrue(done.await(5, TimeUnit.SECONDS))
                return JSONArray(value)
            }
            fun checkLayout() {
                var metrics = inspect()
                val deadline = android.os.SystemClock.uptimeMillis() + 12_000
                while (metrics.getDouble(1) == 0.0 && android.os.SystemClock.uptimeMillis() < deadline) {
                    android.os.SystemClock.sleep(200)
                    metrics = inspect()
                }
                assertEquals(1280, metrics.getInt(0))
                assertEquals(1120.0, metrics.getDouble(1), 1.0)
                assertFalse(metrics.getBoolean(2))
                if (fixturePath == null) assertEquals("560px 560px", metrics.getString(3))
            }
            checkLayout()
            scenario.onActivity { web.layoutParams = web.layoutParams.apply { width = (600 * web.resources.displayMetrics.density).toInt() } }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            checkLayout()
            scenario.onActivity { web.zoomBy(0.5f) }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            checkLayout()
            scenario.onActivity { web.destroy() }
        }
    }
}
