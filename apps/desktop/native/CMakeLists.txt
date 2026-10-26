cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)

project(tentenv_xr LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT WIN32)
  message(FATAL_ERROR "tentenv_xr is Windows only (OpenXR + D3D11)")
endif()

# Khronos OpenXR SDK（scripts/fetch-openxr.mjs が取得する）
set(OPENXR_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/openxr)
if(NOT EXISTS ${OPENXR_DIR}/include/openxr/openxr.h)
  message(FATAL_ERROR "OpenXR SDK not found in ${OPENXR_DIR}. Run: npm run fetch:openxr")
endif()

# node-addon-api のヘッダ（npm workspaces なのでリポジトリのルートに巻き上げられていることが多い）
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

add_library(${PROJECT_NAME} SHARED
  src/addon.cpp
  src/openxr_session.cpp
  src/mock_session.cpp
  ${CMAKE_JS_SRC}
)
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_JS_INC} ${NODE_ADDON_API_DIR} ${OPENXR_DIR}/include)
target_compile_definitions(${PROJECT_NAME} PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS UNICODE _UNICODE)
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} ${OPENXR_DIR}/x64/lib/openxr_loader.lib d3d11 dxgi)
if(MSVC)
  target_compile_options(${PROJECT_NAME} PRIVATE /EHsc /W3 /utf-8)
endif()

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

# openxr_loader.dll を .node の隣に置く（Windows の DLL 探索はモジュールのフォルダを見る）
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different ${OPENXR_DIR}/x64/bin/openxr_loader.dll $<TARGET_FILE_DIR:${PROJECT_NAME}>)
