import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val localProperties = Properties().apply {
    val propertiesFile = rootProject.file("local.properties")
    if (propertiesFile.exists()) propertiesFile.inputStream().use(::load)
}

val releaseSigningProperties = Properties().apply {
    val signingFile = rootProject.file(".signing/release.properties")
    if (signingFile.exists()) signingFile.inputStream().use(::load)
}

fun localValue(name: String, fallback: String): String = localProperties.getProperty(name, fallback)
fun buildConfigString(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val configuredApiBaseUrl = localValue("API_BASE_URL", "http://10.0.2.2:3000/")
val configuredMockMode = localValue("MOCK_MODE", "false").toBoolean()
val buildingRelease = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
if (buildingRelease && !configuredMockMode && !configuredApiBaseUrl.startsWith("https://")) {
    throw GradleException("正式版必须使用 HTTPS API_BASE_URL，当前配置为：$configuredApiBaseUrl")
}

android {
    namespace = "com.aiexam.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aiexam.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.2.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "API_BASE_URL", buildConfigString(configuredApiBaseUrl))
        buildConfigField("String", "API_BEARER_TOKEN", buildConfigString(if (buildingRelease) "" else localValue("API_BEARER_TOKEN", "")))
    }

    signingConfigs {
        create("release") {
            if (releaseSigningProperties.isNotEmpty()) {
                storeFile = rootProject.file(releaseSigningProperties.getProperty("storeFile"))
                storePassword = releaseSigningProperties.getProperty("storePassword")
                keyAlias = releaseSigningProperties.getProperty("keyAlias")
                keyPassword = releaseSigningProperties.getProperty("keyPassword")
            } else if (buildingRelease) {
                throw GradleException("Release signing requires .signing/release.properties")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["allowCleartextTraffic"] = "true"
            buildConfigField("boolean", "MOCK_MODE", configuredMockMode.toString())
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            manifestPlaceholders["allowCleartextTraffic"] = "false"
            buildConfigField("boolean", "MOCK_MODE", configuredMockMode.toString())
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions.jvmTarget = "17"
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.core.splashscreen)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
