import { authedController } from '../lib/http/controller';
import * as usersService from '../services/users.service';
import type { AvatarUploadRequest, UpdateAvatarInput } from '../validators/users.validator';

export const createAvatarUpload = authedController<{ body: AvatarUploadRequest }>(async (req, res) => {
  const upload = await usersService.createAvatarUpload(req.auth.user.id, req.validated.body.contentType);

  res.customSuccess({
    status: 201,
    message: 'Avatar upload created successfully',
    data: upload,
  });
});

export const updateAvatar = authedController<{ body: UpdateAvatarInput }>(async (req, res) => {
  const avatar = await usersService.setAvatar(req.auth.user.id, req.validated.body.key);

  res.customSuccess({
    message: 'Avatar updated successfully',
    data: avatar,
  });
});
