/* HLSL front end stubs (no bison/flex here). d3dbc input never reaches these. */
#include <stdlib.h>
#include <string.h>
#include "hlsl.h"
#include "vkd3d_shader_private.h"

struct hlsl_ir_node *hlsl_add_load_component(struct hlsl_ctx *ctx, struct hlsl_block *block,
        struct hlsl_ir_node *var_instr, unsigned int comp, const struct vkd3d_shader_location *loc)
{
    (void)ctx; (void)block; (void)var_instr; (void)comp; (void)loc;
    return NULL;
}

int hlsl_lexer_compile(struct hlsl_ctx *ctx, const struct vkd3d_shader_code *hlsl)
{
    (void)ctx; (void)hlsl;
    return -1;
}

/* Pass-through: copy the source unchanged (no preprocessor). */
int preproc_lexer_parse(const struct vkd3d_shader_compile_info *compile_info,
        struct vkd3d_shader_code *out, struct vkd3d_shader_message_context *message_context)
{
    (void)message_context;
    out->code = malloc(compile_info->source.size);
    if (!out->code && compile_info->source.size)
        return -1;
    memcpy((void *)out->code, compile_info->source.code, compile_info->source.size);
    out->size = compile_info->source.size;
    return 0;
}
