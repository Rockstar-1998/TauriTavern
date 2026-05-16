import java.io.File
import javax.inject.Inject
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations

open class BuildTask @Inject constructor(
    private val execOperations: ExecOperations,
) : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null


    @TaskAction
    fun assemble() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val rootDir = File(project.projectDir, rootDirRel)
        val traceFile = File(rootDir, "android-rust-build-trace.txt")
        fun trace(message: String) {
            traceFile.appendText(message + System.lineSeparator())
        }

        val kotlinOutDir = File(project.projectDir, "src/main/java/com/tauritavern/client/generated")
        val androidProjectPath = project.rootProject.projectDir.absolutePath
        val androidPackage = "com.tauritavern.client"
        val androidLibrary = "tauritavern"

        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        // Map Tauri target name to Rust target triple
        val rustTarget = when (target) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> target
        }

        val profile = if (release) "release" else "debug"
        val cargoArgs = mutableListOf("build", "--target", rustTarget, "--lib")
        if (release) {
            cargoArgs.add("--release")
        }

        try {
            val gradleVersion = project.gradle.gradleVersion
            val ndkBin = "E:\\LibSoftware\\android_sdk\\ndk\\29.0.14206865\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin"
            val clangSuffix = "24-clang.cmd"
            val clangPlusSuffix = "24-clang++.cmd"

            val ccPrefix = when (target) {
                "aarch64" -> "aarch64-linux-android"
                "armv7" -> "armv7a-linux-androideabi"
                "i686" -> "i686-linux-android"
                "x86_64" -> "x86_64-linux-android"
                else -> target
            }

            val envTarget = rustTarget.replace("-", "_")
            val ccValue = "$ndkBin\\$ccPrefix$clangSuffix"
            val cxxValue = "$ndkBin\\$ccPrefix$clangPlusSuffix"
            val arValue = "$ndkBin\\llvm-ar.exe"
            val ranlibValue = "$ndkBin\\llvm-ranlib.exe"
            val cargoHome = "D:\\software_cache\\.cargo"
            val rustupHome = "E:\\LibSoftware\\Rust\\rustup"

            logger.lifecycle("[BuildTask] Gradle version: $gradleVersion")
            logger.lifecycle("[BuildTask] projectDir: ${project.projectDir}")
            logger.lifecycle("[BuildTask] rootDirRel: $rootDirRel")
            logger.lifecycle("[BuildTask] resolved rootDir: $rootDir")
            logger.lifecycle("[BuildTask] target: $target, rustTarget: $rustTarget, profile: $profile")
            logger.lifecycle("[BuildTask] cargo args: ${cargoArgs.joinToString(" ")}")
            logger.lifecycle("[BuildTask] envTarget: $envTarget")
            logger.lifecycle("[BuildTask] CC_$envTarget=$ccValue")
            logger.lifecycle("[BuildTask] CXX_$envTarget=$cxxValue")
            logger.lifecycle("[BuildTask] AR_$envTarget=$arValue")
            logger.lifecycle("[BuildTask] RANLIB_$envTarget=$ranlibValue")
            logger.lifecycle("[BuildTask] CARGO_HOME=$cargoHome")
            logger.lifecycle("[BuildTask] RUSTUP_HOME=$rustupHome")
            logger.lifecycle("[BuildTask] cargo executable path probe via PATH only")
            logger.lifecycle("[BuildTask] WRY_ANDROID_PACKAGE=$androidPackage")
            logger.lifecycle("[BuildTask] WRY_ANDROID_LIBRARY=$androidLibrary")
            logger.lifecycle("[BuildTask] WRY_ANDROID_KOTLIN_FILES_OUT_DIR=${kotlinOutDir.absolutePath}")
            logger.lifecycle("[BuildTask] TAURI_ANDROID_PROJECT_PATH=$androidProjectPath")
            trace("[BuildTask] start projectDir=${project.projectDir} rootDir=$rootDir target=$target rustTarget=$rustTarget profile=$profile")
            trace("[BuildTask] cargo=${cargoArgs.joinToString(" ")}")
            trace("[BuildTask] CC_$envTarget=$ccValue")
            trace("[BuildTask] CXX_$envTarget=$cxxValue")
            trace("[BuildTask] AR_$envTarget=$arValue")
            trace("[BuildTask] RANLIB_$envTarget=$ranlibValue")
            trace("[BuildTask] WRY_ANDROID_PACKAGE=$androidPackage")
            trace("[BuildTask] WRY_ANDROID_LIBRARY=$androidLibrary")
            trace("[BuildTask] WRY_ANDROID_KOTLIN_FILES_OUT_DIR=${kotlinOutDir.absolutePath}")
            trace("[BuildTask] TAURI_ANDROID_PROJECT_PATH=$androidProjectPath")

            println("Direct Cargo Build: cargo ${cargoArgs.joinToString(" ")}")
            execOperations.exec {
                workingDir(rootDir)
                executable("cargo")
                args(cargoArgs)
                environment("CC_$envTarget", ccValue)
                environment("CXX_$envTarget", cxxValue)
                environment("AR_$envTarget", arValue)
                environment("RANLIB_$envTarget", ranlibValue)
                environment("CARGO_HOME", cargoHome)
                environment("RUSTUP_HOME", rustupHome)
                environment("WRY_ANDROID_PACKAGE", androidPackage)
                environment("WRY_ANDROID_LIBRARY", androidLibrary)
                environment("WRY_ANDROID_KOTLIN_FILES_OUT_DIR", kotlinOutDir.absolutePath)
                environment("TAURI_ANDROID_PROJECT_PATH", androidProjectPath)
                environment("TAURI_ANDROID_PACKAGE_UNESCAPED", androidPackage)
            }.assertNormalExitValue()

            // Copy resulting .so to jniLibs
            val abi = when (target) {
                "aarch64" -> "arm64-v8a"
                "armv7" -> "armeabi-v7a"
                "i686" -> "x86"
                "x86_64" -> "x86_64"
                else -> target
            }

            val sourceFile = File(rootDir, "target/$rustTarget/$profile/libtauritavern_lib.so")
            val destDir = File(project.projectDir, "src/main/jniLibs/$abi")
            if (!destDir.exists()) destDir.mkdirs()
            val primaryDestFile = File(destDir, "libtauritavern_lib.so")
            val compatDestFile = File(destDir, "libtauritavern.so")

            logger.lifecycle("[BuildTask] sourceFile exists=${sourceFile.exists()} path=$sourceFile")
            logger.lifecycle("[BuildTask] destDir exists=${destDir.exists()} path=$destDir")
            logger.lifecycle("[BuildTask] primaryDestFile path=$primaryDestFile")
            logger.lifecycle("[BuildTask] compatDestFile path=$compatDestFile")
            logger.lifecycle("[BuildTask] kotlinOutDir exists=${kotlinOutDir.exists()} path=$kotlinOutDir")
            trace("[BuildTask] source exists=${sourceFile.exists()} path=$sourceFile")
            trace("[BuildTask] destDir exists=${destDir.exists()} path=$destDir")
            trace("[BuildTask] primaryDestFile=$primaryDestFile")
            trace("[BuildTask] compatDestFile=$compatDestFile")
            trace("[BuildTask] kotlinOutDir exists=${kotlinOutDir.exists()} path=${kotlinOutDir.absolutePath}")
            println("Copying $sourceFile to $primaryDestFile")
            sourceFile.copyTo(primaryDestFile, overwrite = true)
            println("Copying $sourceFile to $compatDestFile")
            sourceFile.copyTo(compatDestFile, overwrite = true)
            trace("[BuildTask] primary exists after copy=${primaryDestFile.exists()} length=${primaryDestFile.length()}")
            trace("[BuildTask] compat exists after copy=${compatDestFile.exists()} length=${compatDestFile.length()}")
            trace("[BuildTask] generated WryActivity exists=${File(kotlinOutDir, "WryActivity.kt").exists()}")
            trace("[BuildTask] generated Ipc exists=${File(kotlinOutDir, "Ipc.kt").exists()}")
            trace("[BuildTask] generated RustWebViewClient exists=${File(kotlinOutDir, "RustWebViewClient.kt").exists()}")

        } catch (e: Exception) {
            trace("[BuildTask] FAILED ${e::class.java.name}: ${e.message}")
            throw GradleException("Direct Cargo build failed: ${e.message}", e)
        }
    }
}
