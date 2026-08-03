// When this page is served directly by server.js (locally, or on Render itself), the API lives
// on the same origin - use relative paths so these calls never leave the browser's same-origin
// case and don't need CORS at all. Only when this static page is copied to Netlify (a different
// origin than the API) do we need the absolute Render URL - see server.js's CORS config.
// This is a plain hardcoded value, not an env var: this file is static client-side JS with no
// build step, so there's no "process.env" to read here. Update this literal string if the
// Render URL or the Netlify hostname ever changes.
var API_BASE = (window.location.hostname === 'grubwatch.netlify.app')
  ? 'https://overwatch-0bic.onrender.com'
  : '';

/*
  Purpose: Pass information to other helper functions after a user clicks 'Predict'
  Args:
    value - Actual filename or URL
    source - 'url' or 'file'
*/
function predict_click(value, source) {
  var preview = $(".food-photo");
  var file    = document.querySelector("input[type=file]").files[0];
  var loader  = "https://s3.amazonaws.com/static.mlh.io/icons/loading.svg";
  var reader  = new FileReader();

  // load local file picture
  reader.addEventListener("load", function () {
    preview.attr('style', 'background-image: url("' + reader.result + '");');
    doPredict(reader.result.split("base64,")[1]);
  }, false);

  if (file) {
    reader.readAsDataURL(file);
    $('#concepts').html('<img src="' + loader + '" class="loading" />');
  } else { alert("No file selected!"); }
}

/*
  Purpose: Sends the photo to our own server, which identifies the food and looks up its nutrition facts
  Args:
    base64 - Base64-encoded image data (no "data:image/...;base64," prefix)
*/
function doPredict(base64) {
  $.ajax({
    url: API_BASE + '/api/detect-food',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ base64: base64 })
  }).done(function (result) {
    var tag = result.tag;
    var nutritionImageUrl = API_BASE + '/api/nutrition-image?tag=' + encodeURIComponent(tag);
    $('#concepts').html('<h3>' + tag + '</h3>' + '<img src="' + nutritionImageUrl + '" class="zoomable" title="Click to enlarge">');
    $('#concepts img').on('click', function () {
      openLightbox(nutritionImageUrl);
    }).on('error', function () {
      $(this).replaceWith('<p>Sorry, we could not find nutrition facts for "' + tag + '".</p>');
    });
  }).fail(function (xhr) {
    var message = (xhr.responseJSON && xhr.responseJSON.error) || 'Something went wrong analyzing your photo.';
    $('#concepts').html('<p>' + message + '</p>');
  });
}

/*
  Purpose: Shows a full-size version of the nutrition image in a full-screen overlay.
  Args:
    src - URL of the image to display
*/
function openLightbox(src) {
  var lightbox = $('#nutrition-lightbox');
  if (lightbox.length === 0) {
    lightbox = $('<div id="nutrition-lightbox" class="lightbox"><img></div>').appendTo('body');
    lightbox.on('click', function () {
      lightbox.removeClass('open');
    });
  }
  lightbox.find('img').attr('src', src);
  lightbox.addClass('open');
}
