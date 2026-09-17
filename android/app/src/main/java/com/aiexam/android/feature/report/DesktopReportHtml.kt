package com.aiexam.android.feature.report

/** Keep the server's 1120px report and desktop breakpoints; only the viewing viewport changes. */
internal object DesktopReportHtml {
    const val WIDTH = 1280

    fun prepare(html: String): String {
        val meta = Regex("""<meta\b[^>]*>""", RegexOption.IGNORE_CASE)
        val viewportName = Regex("""\bname\s*=\s*(?:"viewport"|'viewport'|viewport(?=\s|/?>))""", RegexOption.IGNORE_CASE)
        val cleaned = meta.replace(html) { match ->
            if (viewportName.containsMatchIn(match.value)) "" else match.value
        }
        val settings = """<meta name="viewport" content="width=$WIDTH, initial-scale=1, minimum-scale=0.1, maximum-scale=5, user-scalable=yes"><style id="android-report-viewport">html{min-width:${WIDTH}px!important;-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}body{min-width:${WIDTH}px!important}</style>"""
        // Next.js hydration can replace the viewport again after load. Keep its metadata
        // synchronized without touching report DOM, grids, typography or print styles.
        val guard = """<script>(function(){
            var content='width=$WIDTH, initial-scale=1, minimum-scale=0.1, maximum-scale=5, user-scalable=yes';
            function enforce(){
                var metas=document.head.querySelectorAll('meta[name="viewport"]');
                if(!metas.length){var meta=document.createElement('meta');meta.name='viewport';meta.content=content;document.head.appendChild(meta);}
                else metas.forEach(function(meta){if(meta.content!==content)meta.content=content;});
            }
            new MutationObserver(enforce).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content','name']});
            enforce();
        })();</script>"""
        val head = Regex("""<head\b[^>]*>""", RegexOption.IGNORE_CASE).find(cleaned)
        return if (head != null) cleaned.substring(0, head.range.last + 1) + settings + guard + cleaned.substring(head.range.last + 1)
        else "<head>$settings$guard</head>$cleaned"
    }
}
