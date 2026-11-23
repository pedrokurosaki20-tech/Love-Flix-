package com.loveflix.app

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.widget.FrameLayout

class Canal2ContainerLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    var passThroughTouches: Boolean = false

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (passThroughTouches) {
            return false
        }
        return super.dispatchTouchEvent(ev)
    }
}
