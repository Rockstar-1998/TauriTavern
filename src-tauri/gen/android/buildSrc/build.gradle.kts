buildscript {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
        google()
        mavenCentral()
    }
    dependencies {
        classpath("org.gradle.kotlin:gradle-kotlin-dsl-plugins:6.2.0")
    }
}

apply(plugin = "java-gradle-plugin")
apply(plugin = "org.gradle.kotlin.kotlin-dsl")

configure<org.gradle.plugin.devel.GradlePluginDevelopmentExtension> {
    plugins.create("pluginsForCoolKids") {
        id = "rust"
        implementationClass = "RustPlugin"
    }
}

repositories {
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    google()
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:8.11.0")
}

